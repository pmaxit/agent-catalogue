import { resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  renderArticlePage,
  renderArticlesIndex,
  renderNotFound,
} from "./article-pages.js";
import { isMockMode, loadConfig, resolveApiKey } from "./config.js";
import { CursorClient } from "./cursor-client.js";
import {
  ArticleStore,
  SAMPLE_ARTICLES,
  blocksToMarkdown,
  type Block,
  type PublishInput,
} from "./db.js";
import { WritingOrchestrator } from "./orchestrator.js";
import type { BriefInput, PipelineEvent } from "./types.js";

const config = loadConfig();
const mock = isMockMode(config);
const apiKey = resolveApiKey(config);

const client =
  !mock && apiKey
    ? new CursorClient({
        baseUrl: config.api.base_url.replace(/\/$/, ""),
        apiKey,
        auth: config.api.auth,
        requestTimeoutMs: config.api.request_timeout_ms,
      })
    : null;

const orchestrator = new WritingOrchestrator(config, client, mock);
const store = new ArticleStore();
const seeded = store.seedIfEmpty(SAMPLE_ARTICLES);
const diagramsBackfilled = store.ensureDiagramsOnPublished();

const port = Number(config.app.port) || 8080;
const publicDir = resolve(process.cwd(), config.app.public_dir);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

function parseBlocks(blocksJson: string): Block[] {
  try {
    return JSON.parse(blocksJson) as Block[];
  } catch {
    return [];
  }
}

function publishedOnly() {
  return store.list(500).filter((a) => a.status === "published");
}

app.get("/api/health", async () => ({
  ok: true,
  mock,
  title: config.app.title,
  workflow: config.workflow.name,
  goal: config.goal.name,
  agents: Object.keys(config.agents),
  sqlite: {
    path: store.path,
    articles: store.list(1000).length,
    seeded,
  },
}));

app.get("/api/config", async () => ({
  title: config.app.title,
  tagline: config.app.tagline,
  mock,
  goal: {
    name: config.goal.name,
    max_iterations: config.goal.max_iterations,
    criteria: config.goal.criteria.map((c) => ({
      id: c.id,
      label: c.label,
      threshold: c.threshold,
      description: c.description,
    })),
  },
  agents: Object.entries(config.agents).map(([id, a]) => ({
    id,
    name: a.name,
    description: a.description,
    output_key: a.output_key,
    mode: a.mode ?? config.defaults.mode,
    model: (a.model ?? config.defaults.model).id,
  })),
  workflow: {
    name: config.workflow.name,
    entry: config.workflow.entry,
    end: config.workflow.end,
    nodes: Object.entries(config.workflow.nodes).map(([id, n]) => ({
      id,
      agent: n.agent,
      next: n.next,
      routes: n.routes,
    })),
  },
  defaults: {
    model: config.defaults.model.id,
    runtime: config.defaults.runtime,
    session: config.defaults.session,
  },
}));

type ArticleBody = {
  id?: string;
  slug?: string;
  title?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  blocks?: Block[];
  brief?: string;
  audience?: string;
  tone?: string;
  format?: string;
  length?: string;
  theme?: string;
  goal?: string;
  changeSummary?: string;
  status?: "draft" | "published";
};

function toPublishInput(body: ArticleBody): PublishInput {
  const blocks = body.blocks;
  const bodyMarkdown =
    body.bodyMarkdown?.trim() ||
    (blocks && blocks.length ? blocksToMarkdown(blocks) : "");
  return {
    id: body.id,
    slug: body.slug,
    title: body.title,
    bodyMarkdown,
    bodyHtml: body.bodyHtml,
    blocks,
    changeSummary: body.changeSummary,
    status: body.status ?? "published",
    meta: {
      brief: body.brief,
      audience: body.audience,
      tone: body.tone,
      format: body.format,
      length: body.length,
      theme: body.theme,
      goal: body.goal,
    },
  };
}

app.get("/api/articles", async () => {
  const articles = store.list().map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    status: a.status,
    revision: a.revision,
    theme: a.theme,
    goal: a.goal,
    updated_at: a.updated_at,
    published_at: a.published_at,
    created_at: a.created_at,
    url: `/articles/${a.slug}`,
  }));
  return { articles };
});

app.get<{ Params: { id: string } }>("/api/articles/:id", async (req, reply) => {
  const article = store.get(req.params.id);
  if (!article) return reply.code(404).send({ error: "Article not found" });
  const blocks = parseBlocks(article.blocks_json);
  return {
    article: { ...article, blocks, url: `/articles/${article.slug}` },
  };
});

app.get<{ Params: { id: string } }>(
  "/api/articles/:id/history",
  async (req, reply) => {
    const article = store.get(req.params.id);
    if (!article) return reply.code(404).send({ error: "Article not found" });
    const revisions = store.history(article.id).map((r) => ({
      id: r.id,
      revision: r.revision,
      title: r.title,
      change_summary: r.change_summary,
      created_at: r.created_at,
    }));
    return { articleId: article.id, revisions };
  },
);

app.get<{ Params: { id: string; rev: string } }>(
  "/api/articles/:id/revisions/:rev",
  async (req, reply) => {
    const article = store.get(req.params.id);
    if (!article) return reply.code(404).send({ error: "Article not found" });
    const rev = Number(req.params.rev);
    if (!Number.isFinite(rev)) {
      return reply.code(400).send({ error: "Invalid revision" });
    }
    const revision = store.getRevision(article.id, rev);
    if (!revision) return reply.code(404).send({ error: "Revision not found" });
    const blocks = parseBlocks(revision.blocks_json);
    return { revision: { ...revision, blocks } };
  },
);

app.post<{ Body: ArticleBody }>("/api/articles", async (req, reply) => {
  try {
    const article = store.publish(toPublishInput(req.body ?? {}));
    const blocks = parseBlocks(article.blocks_json);
    return reply.code(201).send({
      article: { ...article, blocks, url: `/articles/${article.slug}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.put<{ Params: { id: string }; Body: ArticleBody }>(
  "/api/articles/:id",
  async (req, reply) => {
    const existing = store.get(req.params.id);
    if (!existing) return reply.code(404).send({ error: "Article not found" });
    try {
      const article = store.publish(
        toPublishInput({ ...(req.body ?? {}), id: existing.id }),
      );
      const blocks = parseBlocks(article.blocks_json);
      return {
        article: { ...article, blocks, url: `/articles/${article.slug}` },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(400).send({ error: message });
    }
  },
);

app.get("/articles", async (_req, reply) => {
  const html = renderArticlesIndex(publishedOnly());
  return reply.type("text/html; charset=utf-8").send(html);
});

app.get<{ Params: { slug: string } }>("/articles/:slug", async (req, reply) => {
  const article = store.get(req.params.slug);
  if (!article || article.status !== "published") {
    return reply
      .code(404)
      .type("text/html; charset=utf-8")
      .send(renderNotFound(req.params.slug));
  }
  const blocks = parseBlocks(article.blocks_json);
  const html = renderArticlePage(article, blocks);
  return reply.type("text/html; charset=utf-8").send(html);
});

app.post<{ Body: BriefInput }>("/api/run", async (req, reply) => {
  const body = req.body ?? ({} as BriefInput);
  if (!body.brief || typeof body.brief !== "string" || !body.brief.trim()) {
    return reply.code(400).send({ error: "brief is required" });
  }

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const send = (event: PipelineEvent) => {
    reply.raw.write(`event: ${event.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const ac = new AbortController();
  const stop = () => {
    if (!ac.signal.aborted) ac.abort();
  };
  req.socket.on("error", stop);

  try {
    await orchestrator.run({
      brief: {
        brief: body.brief.trim(),
        audience: body.audience,
        tone: body.tone,
        format: body.format,
        length: body.length,
        theme: body.theme,
        goal: body.goal,
      },
      signal: ac.signal,
      onEvent: async (event) => {
        if (reply.raw.destroyed || reply.raw.writableEnded) {
          stop();
          return;
        }
        send(event);
      },
    });
  } catch (err) {
    if (ac.signal.aborted) return;
    const message = err instanceof Error ? err.message : String(err);
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      send({
        type: "pipeline_finished",
        status: "error",
        state: {},
        error: message,
      });
    }
  } finally {
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  }
});

await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
});

const shutdown = () => {
  try {
    store.close();
  } catch {
    /* ignore */
  }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ port, host: "0.0.0.0" });
app.log.info(
  {
    port,
    mock,
    config: "config/agents.yaml",
    title: config.app.title,
    sqlite: store.path,
    seeded,
    diagramsBackfilled,
  },
  "writing-agent listening",
);
