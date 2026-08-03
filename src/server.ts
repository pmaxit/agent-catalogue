import { resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import {
  renderArticlePage,
  renderArticlesIndex,
  renderNotFound,
} from "./article-pages.js";
import {
  renderBookNotFound,
  renderBookPage,
  renderBooksIndex,
  renderChapterPage,
} from "./book-pages.js";
import { isMockMode, loadConfig, resolveApiKey } from "./config.js";
import { CursorClient } from "./cursor-client.js";
import { startSseHeartbeat } from "./sse.js";
import {
  ArticleStore,
  SAMPLE_ARTICLES,
  blocksToMarkdown,
  ensureBlockIds,
  markdownToBlocks,
  mergeBlocksById,
  parseMarkedBlocks,
  type Block,
  type PublishInput,
} from "./db.js";
import { WritingOrchestrator } from "./orchestrator.js";
import {
  buildQmd,
  renderNotebookHtml,
  suggestFilename,
} from "./quarto.js";
import {
  suggestBrief,
  type SuggestBriefInput,
} from "./suggest-brief.js";
import {
  listStudioThemePlaybooks,
  resolveThemePlaybook,
} from "./themes.js";
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
    books: store.listBooks(1000).length,
    seeded,
  },
}));

app.get("/api/config", async () => ({
  title: config.app.title,
  tagline: config.app.tagline,
  mock,
  themes: listStudioThemePlaybooks().map((t) => ({
    id: t.id,
    label: t.label,
    studioTheme: t.studioTheme,
    quarto: t.quarto,
  })),
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

app.get("/api/books", async () => {
  const books = store.listBooks().map((b) => {
    const chapters = store.listChapters(b.id);
    return {
      id: b.id,
      slug: b.slug,
      title: b.title,
      synopsis: b.synopsis,
      status: b.status,
      revision: b.revision,
      theme: b.theme,
      goal: b.goal,
      chapterCount: chapters.length,
      updated_at: b.updated_at,
      published_at: b.published_at,
      url: `/books/${b.slug}`,
    };
  });
  return { books };
});

app.get<{ Params: { id: string } }>("/api/books/:id", async (req, reply) => {
  const book = store.getBook(req.params.id);
  if (!book) return reply.code(404).send({ error: "Book not found" });
  const chapters = store.listChapters(book.id).map((c) => ({
    id: c.id,
    slug: c.slug,
    title: c.title,
    sort_order: c.sort_order,
    status: c.status,
    revision: c.revision,
    theme: c.theme,
    updated_at: c.updated_at,
    url: `/books/${book.slug}/${c.slug}`,
  }));
  let overviewBlocks: Block[] = [];
  try {
    overviewBlocks = parseBlocks(book.overview_blocks_json);
  } catch {
    overviewBlocks = [];
  }
  return {
    book: {
      ...book,
      overviewBlocks,
      chapters,
      url: `/books/${book.slug}`,
    },
  };
});

app.post<{
  Body: {
    title?: string;
    slug?: string;
    synopsis?: string;
    overviewMarkdown?: string;
    audience?: string;
    tone?: string;
    format?: string;
    length?: string;
    theme?: string;
    goal?: string;
    status?: "draft" | "published";
  };
}>("/api/books", async (req, reply) => {
  try {
    const body = req.body ?? {};
    if (!body.title?.trim()) {
      return reply.code(400).send({ error: "title is required" });
    }
    const book = store.upsertBook({
      title: body.title.trim(),
      slug: body.slug,
      synopsis: body.synopsis,
      overviewMarkdown: body.overviewMarkdown,
      status: body.status ?? "published",
      meta: {
        audience: body.audience,
        tone: body.tone,
        format: body.format,
        length: body.length,
        theme: body.theme,
        goal: body.goal,
      },
    });
    return reply.code(201).send({
      book: { ...book, chapters: [], url: `/books/${book.slug}` },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.put<{
  Params: { id: string };
  Body: {
    title?: string;
    slug?: string;
    synopsis?: string;
    overviewMarkdown?: string;
    overviewBlocks?: Block[];
    audience?: string;
    tone?: string;
    format?: string;
    length?: string;
    theme?: string;
    goal?: string;
    status?: "draft" | "published";
  };
}>("/api/books/:id", async (req, reply) => {
  const existing = store.getBook(req.params.id);
  if (!existing) return reply.code(404).send({ error: "Book not found" });
  try {
    const body = req.body ?? {};
    const book = store.upsertBook({
      id: existing.id,
      title: body.title?.trim() || existing.title,
      slug: body.slug,
      synopsis: body.synopsis,
      overviewMarkdown: body.overviewMarkdown,
      overviewBlocks: body.overviewBlocks,
      status: body.status ?? (existing.status as "draft" | "published"),
      meta: {
        audience: body.audience,
        tone: body.tone,
        format: body.format,
        length: body.length,
        theme: body.theme,
        goal: body.goal,
      },
    });
    const chapters = store.listChapters(book.id);
    return { book: { ...book, chapters, url: `/books/${book.slug}` } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.get<{ Params: { id: string } }>(
  "/api/chapters/:id",
  async (req, reply) => {
    const chapter = store.getChapter(req.params.id);
    if (!chapter) return reply.code(404).send({ error: "Chapter not found" });
    const book = store.getBook(chapter.book_id);
    if (!book) return reply.code(404).send({ error: "Book not found" });
    const blocks = parseBlocks(chapter.blocks_json);
    return {
      chapter: {
        ...chapter,
        blocks,
        url: `/books/${book.slug}/${chapter.slug}`,
        book: { id: book.id, slug: book.slug, title: book.title },
      },
    };
  },
);

app.get<{ Params: { id: string } }>(
  "/api/chapters/:id/history",
  async (req, reply) => {
    const chapter = store.getChapter(req.params.id);
    if (!chapter) return reply.code(404).send({ error: "Chapter not found" });
    const revisions = store.chapterHistory(chapter.id).map((r) => ({
      id: r.id,
      revision: r.revision,
      title: r.title,
      change_summary: r.change_summary,
      created_at: r.created_at,
    }));
    return { chapterId: chapter.id, revisions };
  },
);

app.get<{ Params: { id: string; rev: string } }>(
  "/api/chapters/:id/revisions/:rev",
  async (req, reply) => {
    const chapter = store.getChapter(req.params.id);
    if (!chapter) return reply.code(404).send({ error: "Chapter not found" });
    const rev = Number(req.params.rev);
    if (!Number.isFinite(rev)) {
      return reply.code(400).send({ error: "Invalid revision" });
    }
    const revision = store.getChapterRevision(chapter.id, rev);
    if (!revision) return reply.code(404).send({ error: "Revision not found" });
    return { revision: { ...revision, blocks: parseBlocks(revision.blocks_json) } };
  },
);

app.post<{
  Body: ArticleBody & {
    bookId?: string;
    sortOrder?: number;
  };
}>("/api/chapters", async (req, reply) => {
  try {
    const body = req.body ?? {};
    if (!body.bookId) {
      return reply.code(400).send({ error: "bookId is required" });
    }
    const blocks = body.blocks?.length
      ? ensureBlockIds(body.blocks)
      : undefined;
    const chapter = store.publishChapter({
      bookId: body.bookId,
      slug: body.slug,
      title: body.title,
      sortOrder: body.sortOrder,
      bodyMarkdown: body.bodyMarkdown,
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
    });
    const book = store.getBook(chapter.book_id)!;
    return reply.code(201).send({
      chapter: {
        ...chapter,
        blocks: parseBlocks(chapter.blocks_json),
        url: `/books/${book.slug}/${chapter.slug}`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.put<{
  Params: { id: string };
  Body: ArticleBody & { bookId?: string; sortOrder?: number };
}>("/api/chapters/:id", async (req, reply) => {
  const existing = store.getChapter(req.params.id);
  if (!existing) return reply.code(404).send({ error: "Chapter not found" });
  try {
    const body = req.body ?? {};
    const blocks = body.blocks?.length
      ? ensureBlockIds(body.blocks)
      : undefined;
    const chapter = store.publishChapter({
      id: existing.id,
      bookId: body.bookId || existing.book_id,
      slug: body.slug,
      title: body.title,
      sortOrder: body.sortOrder,
      bodyMarkdown: body.bodyMarkdown,
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
    });
    const book = store.getBook(chapter.book_id)!;
    return {
      chapter: {
        ...chapter,
        blocks: parseBlocks(chapter.blocks_json),
        url: `/books/${book.slug}/${chapter.slug}`,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.post<{
  Params: { id: string };
  Body: {
    updates?: Block[];
    selectedIds?: Array<string | number>;
    proposedMarkdown?: string;
    changeSummary?: string;
  };
}>("/api/chapters/:id/apply-blocks", async (req, reply) => {
  const existing = store.getChapter(req.params.id);
  if (!existing) return reply.code(404).send({ error: "Chapter not found" });
  try {
    const body = req.body ?? {};
    let updates = body.updates?.length ? ensureBlockIds(body.updates) : [];
    if (!updates.length && body.proposedMarkdown) {
      const marked = parseMarkedBlocks(body.proposedMarkdown);
      updates = marked.length
        ? marked
        : markdownToBlocks(body.proposedMarkdown);
    }
    if (!updates.length) {
      return reply.code(400).send({ error: "No block updates provided" });
    }
    const chapter = store.applyChapterBlockUpdates(
      existing.id,
      updates,
      body.selectedIds,
      body.changeSummary ?? "Selective block update",
    );
    const book = store.getBook(chapter.book_id)!;
    return {
      chapter: {
        ...chapter,
        blocks: parseBlocks(chapter.blocks_json),
        url: `/books/${book.slug}/${chapter.slug}`,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

app.post<{
  Params: { id: string };
  Body: {
    updates?: Block[];
    selectedIds?: Array<string | number>;
    proposedMarkdown?: string;
    changeSummary?: string;
  };
}>("/api/articles/:id/apply-blocks", async (req, reply) => {
  const existing = store.get(req.params.id);
  if (!existing) return reply.code(404).send({ error: "Article not found" });
  try {
    const body = req.body ?? {};
    let updates = body.updates?.length ? ensureBlockIds(body.updates) : [];
    if (!updates.length && body.proposedMarkdown) {
      const marked = parseMarkedBlocks(body.proposedMarkdown);
      updates = marked.length
        ? marked
        : markdownToBlocks(body.proposedMarkdown);
    }
    if (!updates.length) {
      return reply.code(400).send({ error: "No block updates provided" });
    }
    let current = parseBlocks(existing.blocks_json);
    if (!current.length) current = markdownToBlocks(existing.body_markdown);
    current = ensureBlockIds(current);
    const merged = mergeBlocksById(current, updates, body.selectedIds);
    const article = store.publish({
      id: existing.id,
      title: existing.title,
      slug: existing.slug,
      blocks: merged,
      bodyMarkdown: blocksToMarkdown(merged),
      changeSummary: body.changeSummary ?? "Selective block update",
      status: "published",
      meta: {
        brief: existing.brief ?? undefined,
        audience: existing.audience ?? undefined,
        tone: existing.tone ?? undefined,
        format: existing.format ?? undefined,
        length: existing.length ?? undefined,
        theme: existing.theme ?? undefined,
        goal: existing.goal ?? undefined,
      },
    });
    return {
      article: {
        ...article,
        blocks: parseBlocks(article.blocks_json),
        url: `/articles/${article.slug}`,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(400).send({ error: message });
  }
});

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

app.get("/books", async (_req, reply) => {
  const books = store.listBooks(200).filter((b) => b.status === "published");
  return reply
    .type("text/html; charset=utf-8")
    .send(renderBooksIndex(books));
});

app.get<{ Params: { bookSlug: string } }>(
  "/books/:bookSlug",
  async (req, reply) => {
    const book = store.getBook(req.params.bookSlug);
    if (!book || book.status !== "published") {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(renderBookNotFound(`/books/${req.params.bookSlug}`));
    }
    const chapters = store
      .listChapters(book.id)
      .filter((c) => c.status === "published");
    return reply
      .type("text/html; charset=utf-8")
      .send(renderBookPage(book, chapters));
  },
);

app.get<{ Params: { bookSlug: string; chapterSlug: string } }>(
  "/books/:bookSlug/:chapterSlug",
  async (req, reply) => {
    const book = store.getBook(req.params.bookSlug);
    if (!book || book.status !== "published") {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(
          renderBookNotFound(
            `/books/${req.params.bookSlug}/${req.params.chapterSlug}`,
          ),
        );
    }
    const chapter = store.getChapter(req.params.chapterSlug, book.id);
    if (!chapter || chapter.status !== "published") {
      return reply
        .code(404)
        .type("text/html; charset=utf-8")
        .send(
          renderBookNotFound(
            `/books/${req.params.bookSlug}/${req.params.chapterSlug}`,
          ),
        );
    }
    const siblings = store
      .listChapters(book.id)
      .filter((c) => c.status === "published");
    const html = renderChapterPage(
      book,
      chapter,
      parseBlocks(chapter.blocks_json),
      siblings,
    );
    return reply.type("text/html; charset=utf-8").send(html);
  },
);

type ExportQmdBody = {
  markdown?: string;
  title?: string;
  subtitle?: string;
  bookTitle?: string;
  theme?: string;
  format?: string;
  audience?: string;
  tone?: string;
  length?: string;
  goal?: string;
  slug?: string;
};

app.post<{ Body: ExportQmdBody }>("/api/export/qmd", async (req, reply) => {
  const body = req.body ?? {};
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!markdown.trim()) {
    return reply.code(400).send({ error: "markdown is required" });
  }
  const title =
    (typeof body.title === "string" && body.title.trim()) ||
    "Untitled draft";
  const qmd = buildQmd({
    title,
    markdown,
    subtitle: body.subtitle,
    bookTitle: body.bookTitle,
    theme: body.theme,
    format: body.format,
    audience: body.audience,
    tone: body.tone,
    length: body.length,
    goal: body.goal,
  });
  const filename = suggestFilename({ title, slug: body.slug });
  return reply
    .header(
      "Content-Disposition",
      `attachment; filename="${filename.replace(/"/g, "")}"`,
    )
    .type("text/markdown; charset=utf-8")
    .send(qmd);
});

app.post<{ Body: ExportQmdBody }>("/api/notebook/preview", async (req, reply) => {
  const body = req.body ?? {};
  const markdown = typeof body.markdown === "string" ? body.markdown : "";
  if (!markdown.trim()) {
    return reply.code(400).send({ error: "markdown is required" });
  }
  const title =
    (typeof body.title === "string" && body.title.trim()) ||
    "Untitled draft";
  const html = renderNotebookHtml({
    title,
    markdown,
    subtitle: body.subtitle,
    bookTitle: body.bookTitle,
    theme: body.theme,
    format: body.format,
    audience: body.audience,
    tone: body.tone,
    length: body.length,
    goal: body.goal,
  });
  const playbook = resolveThemePlaybook(body.theme, body.format);
  return { html, themeId: playbook.id, quarto: playbook.quarto };
});

app.post<{ Body: SuggestBriefInput }>("/api/suggest-brief", async (req, reply) => {
  const body = req.body ?? {};
  try {
    const suggestion = await suggestBrief({
      input: {
        bookTitle: body.bookTitle,
        bookSynopsis: body.bookSynopsis,
        chapterTitle: body.chapterTitle,
        chapterNumber: body.chapterNumber,
        existingTheme: body.existingTheme,
        existingGoal: body.existingGoal,
      },
      mock,
      client,
      config,
    });
    return { suggestion, mock };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(502).send({ error: message });
  }
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
  const stopHeartbeat = startSseHeartbeat(reply.raw);

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
        mode: body.mode,
        existingDraft: body.existingDraft,
        selectedBlocks: body.selectedBlocks,
        reviseInstruction: body.reviseInstruction,
        bookTitle: body.bookTitle,
        chapterTitle: body.chapterTitle,
        chapterNumber: body.chapterNumber,
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
    stopHeartbeat();
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
