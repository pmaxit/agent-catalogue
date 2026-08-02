import { resolve } from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { isMockMode, loadConfig, resolveApiKey } from "./config.js";
import { CursorClient } from "./cursor-client.js";
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
const port = Number(config.app.port) || 8080;
const publicDir = resolve(process.cwd(), config.app.public_dir);

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
});

app.get("/api/health", async () => ({
  ok: true,
  mock,
  title: config.app.title,
  workflow: config.workflow.name,
  goal: config.goal.name,
  agents: Object.keys(config.agents),
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

  // Optional cancel: client abort closes the socket; we stop emitting.
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

await app.listen({ port, host: "0.0.0.0" });
app.log.info(
  {
    port,
    mock,
    config: "config/agents.yaml",
    title: config.app.title,
  },
  "writing-agent listening",
);
