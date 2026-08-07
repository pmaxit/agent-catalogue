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
import {
  CursorClient,
  type CursorModel,
  type CursorModelCatalogItem,
} from "./cursor-client.js";
import { resolveDataApiBase, usesRemoteDataApi } from "./data-api.js";
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
  type BookRecord,
  type ChapterRecord,
  type PersistedPipelineRunEvent,
  type PublishInput,
} from "./db.js";
import { WritingOrchestrator } from "./orchestrator.js";
import {
  buildQmd,
  renderNotebookHtml,
  suggestFilename,
} from "./quarto.js";
import {
  suggestModelCandidates,
  suggestBrief,
  type SuggestBriefInput,
  type SuggestTraceEvent,
} from "./suggest-brief.js";
import {
  listStudioThemePlaybooks,
  resolveThemePlaybook,
} from "./themes.js";
import type { BriefInput, PipelineEvent, PipelineEventEnvelope } from "./types.js";

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
const dataApiBase = resolveDataApiBase();
const remoteData = usesRemoteDataApi();
const store = new ArticleStore();
const seeded = remoteData ? 0 : store.seedIfEmpty(SAMPLE_ARTICLES);
const diagramsBackfilled = remoteData ? 0 : store.ensureDiagramsOnPublished();
type RunSubscriber = (event: PersistedPipelineRunEvent) => void;
const runSubscribers = new Map<string, Set<RunSubscriber>>();
const activeRunControllers = new Map<string, AbortController>();
const activeRunPromises = new Map<string, Promise<unknown>>();

function modelParamsKey(params?: Array<{ id: string; value: string }>): string {
  if (!params?.length) return "";
  return params
    .map((p) => `${p.id}=${p.value}`)
    .sort()
    .join("&");
}

function modelSelectionLabel(model: CursorModel): string {
  const key = modelParamsKey(model.params);
  return key ? `${model.id}[${key}]` : model.id;
}

function modelItemMatchesSelection(
  item: CursorModelCatalogItem,
  target: CursorModel,
): boolean {
  const ids = new Set([item.id, ...(item.aliases || [])].filter(Boolean));
  if (!ids.has(target.id)) return false;
  const wanted = modelParamsKey(target.params);
  if (!wanted) return true;
  const variants = item.variants || [];
  if (
    variants.some((variant) => modelParamsKey(variant.params || []) === wanted)
  ) {
    return true;
  }
  const allowedByParameters = (item.parameters || []).every((paramDef) => {
    const desired = target.params?.find((p) => p.id === paramDef.id)?.value;
    if (desired == null) return true;
    const values = paramDef.values || [];
    if (!values.length) return true;
    return values.some((v) => v.value === desired);
  });
  return allowedByParameters;
}

async function validateSuggestModelConfigOnStartup(): Promise<void> {
  if (!client || mock) return;
  try {
    const catalog = await client.listModels();
    const items = catalog?.items || [];
    if (!items.length) {
      app.log.warn("startup suggest model check skipped: /v1/models returned no items");
      return;
    }
    const desired = suggestModelCandidates(config)[0];
    if (!desired) {
      app.log.warn("startup suggest model check skipped: no configured suggest model");
      return;
    }
    const matched = items.some((item) => modelItemMatchesSelection(item, desired));
    if (matched) {
      app.log.info(
        {
          suggestModel: modelSelectionLabel(desired),
        },
        "startup suggest model check passed",
      );
      return;
    }
    const available = items
      .slice(0, 8)
      .map((item) => item.id)
      .filter(Boolean);
    app.log.warn(
      {
        configuredSuggestModel: modelSelectionLabel(desired),
        availableModelIds: available,
        tip: "Use GET /v1/models and pick an exact model.id (+ params) for this API key.",
      },
      "startup suggest model check failed; configured model not in /v1/models catalog",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    app.log.warn(
      { error: message },
      "startup suggest model check failed; could not read /v1/models",
    );
  }
}

function normalizeBriefInput(body: BriefInput): BriefInput {
  return {
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
    chapterId: body.chapterId,
    chapterTitle: body.chapterTitle,
    chapterNumber: body.chapterNumber,
    resumeFromRunId: body.resumeFromRunId,
    resumeFromNodeId: body.resumeFromNodeId,
    resumeIteration: body.resumeIteration,
    runMode: body.runMode,
  };
}

function subscribeRun(runId: string, subscriber: RunSubscriber): () => void {
  let listeners = runSubscribers.get(runId);
  if (!listeners) {
    listeners = new Set<RunSubscriber>();
    runSubscribers.set(runId, listeners);
  }
  listeners.add(subscriber);
  return () => {
    const set = runSubscribers.get(runId);
    if (!set) return;
    set.delete(subscriber);
    if (!set.size) runSubscribers.delete(runId);
  };
}

function broadcastRunEvent(runId: string, event: PersistedPipelineRunEvent): void {
  const listeners = runSubscribers.get(runId);
  if (!listeners?.size) return;
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // best-effort fanout
    }
  }
}

function decorateRunEvent(
  persisted: PersistedPipelineRunEvent,
): PipelineEventEnvelope {
  return {
    ...persisted.event,
    runId: persisted.runId,
    eventId: persisted.id,
  };
}

type PipelineRunFinalResult = {
  status: "completed" | "max_iterations" | "error";
  draft?: string;
  evaluation?: import("./types.js").ManagerEvaluation;
  state: Record<string, string>;
  error?: string;
};

function launchPipelineRun(
  runId: string,
  brief: BriefInput,
  options?: {
    resume?: {
      state?: Record<string, string>;
      iteration?: number;
      nodeId?: string;
    };
    onDraft?: (draft: string, outputKey: string) => void | Promise<void>;
    onFinished?: (result: PipelineRunFinalResult) => void | Promise<void>;
  },
): void {
  if (activeRunPromises.has(runId)) return;
  const ac = new AbortController();
  activeRunControllers.set(runId, ac);
  const transientState: Record<string, string> = {};
  const runPromise = orchestrator
    .run({
      brief,
      signal: ac.signal,
      resume: options?.resume,
      onEvent: async (event) => {
        const active = store.getPipelineRun(runId);
        if (!active || active.status !== "running") return;
        const persisted = store.appendPipelineRunEvent(runId, event);
        broadcastRunEvent(runId, persisted);
        if (event.type === "node_finished") {
          transientState[event.outputKey] = event.output;
          if (event.outputKey === "draft") {
            store.updatePipelineRunProgress({
              runId,
              draft: event.output,
              state: transientState,
            });
            try {
              await options?.onDraft?.(event.output, event.outputKey);
            } catch (err) {
              console.error("pipeline onDraft hook failed", err);
            }
          } else {
            store.updatePipelineRunProgress({
              runId,
              state: transientState,
            });
          }
        }
        if (event.type === "pipeline_finished") {
          store.finishPipelineRun({
            runId,
            status: event.status,
            draft: event.draft,
            evaluation: event.evaluation,
            state: event.state,
            error: event.error,
          });
          try {
            await options?.onFinished?.({
              status: event.status,
              draft: event.draft,
              evaluation: event.evaluation,
              state: event.state,
              error: event.error,
            });
          } catch (err) {
            console.error("pipeline onFinished hook failed", err);
          }
        }
      },
    })
    .catch((err) => {
      const active = store.getPipelineRun(runId);
      if (!active || active.status !== "running") return;
      const message = err instanceof Error ? err.message : String(err);
      const fallback: PipelineEvent = {
        type: "pipeline_finished",
        status: "error",
        state: {},
        error: message,
      };
      const persisted = store.appendPipelineRunEvent(runId, fallback);
      broadcastRunEvent(runId, persisted);
      store.finishPipelineRun({
        runId,
        status: "error",
        state: {},
        error: message,
      });
    })
    .finally(() => {
      activeRunControllers.delete(runId);
      activeRunPromises.delete(runId);
    });
  activeRunPromises.set(runId, runPromise);
}

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

function redirectToRemotePublicPage(
  reply: any,
  path: string,
) {
  const base = dataApiBase?.replace(/\/$/, "");
  if (!remoteData || !base) return false;
  reply.redirect(`${base}${path}`);
  return true;
}

async function fetchRemoteJson<T>(path: string): Promise<T | null> {
  const base = dataApiBase?.replace(/\/$/, "");
  if (!remoteData || !base) return null;
  try {
    const res = await fetch(`${base}${path}`);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function headingFromMarkdown(markdown: string, fallback: string): string {
  return markdown.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

async function persistChapterDraftCheckpoint(args: {
  chapterId: string;
  brief: BriefInput;
  runId: string;
  draft: string;
  changeSummary: string;
}): Promise<void> {
  if (!args.draft.trim()) return;
  if (remoteData) {
    const base = dataApiBase?.replace(/\/$/, "");
    if (!base) return;
    const remoteChapter = await fetchRemoteJson<{
      chapter?: ChapterRecord & {
        book?: { id: string; slug: string; title: string };
      };
    }>(`/api/chapters/${encodeURIComponent(args.chapterId)}`);
    const chapter = remoteChapter?.chapter;
    const book = chapter?.book;
    if (!chapter || !book) return;
    const saveRes = await fetch(
      `${base}/api/chapters/${encodeURIComponent(chapter.id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId: book.id,
          title: headingFromMarkdown(args.draft, chapter.title),
          bodyMarkdown: args.draft,
          brief: args.brief.brief,
          audience: args.brief.audience ?? chapter.audience ?? undefined,
          tone: args.brief.tone ?? chapter.tone ?? undefined,
          format: args.brief.format ?? chapter.format ?? undefined,
          length: args.brief.length ?? chapter.length ?? undefined,
          theme: args.brief.theme ?? chapter.theme ?? undefined,
          goal: args.brief.goal ?? chapter.goal ?? undefined,
          changeSummary: args.changeSummary,
          status: "published",
        }),
      },
    );
    if (!saveRes.ok) {
      const data = await saveRes.json().catch(() => ({}));
      throw new Error(data.error || `Remote chapter save failed (${saveRes.status})`);
    }
    return;
  }
  const chapter = store.getChapter(args.chapterId);
  if (!chapter) return;
  store.publishChapter({
    id: chapter.id,
    bookId: chapter.book_id,
    slug: chapter.slug,
    title: headingFromMarkdown(args.draft, chapter.title),
    sortOrder: chapter.sort_order,
    bodyMarkdown: args.draft,
    changeSummary: args.changeSummary,
    status: "published",
    meta: {
      brief: args.brief.brief,
      audience: args.brief.audience ?? chapter.audience ?? undefined,
      tone: args.brief.tone ?? chapter.tone ?? undefined,
      format: args.brief.format ?? chapter.format ?? undefined,
      length: args.brief.length ?? chapter.length ?? undefined,
      theme: args.brief.theme ?? chapter.theme ?? undefined,
      goal: args.brief.goal ?? chapter.goal ?? undefined,
    },
  });
}

type SuggestChapterBriefContext = {
  chapterId?: string;
  chapterNumber?: number;
  title: string;
  brief: string;
};

function compactBriefText(text: string | null | undefined, max = 420): string {
  if (!text) return "";
  const cleaned = String(text).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

function mergeSuggestChapterContexts(
  ...lists: Array<SuggestChapterBriefContext[]>
): SuggestChapterBriefContext[] {
  const merged: SuggestChapterBriefContext[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const key =
        item.chapterId?.trim() ||
        `${item.chapterNumber ?? "?"}:${item.title.toLowerCase().trim()}`;
      if (!item.brief?.trim()) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged.slice(0, 10);
}

function localBookChapterBriefContext(args: {
  bookId: string;
  currentChapterId?: string;
  targetChapterNumber?: number;
}): SuggestChapterBriefContext[] {
  const chapters = store
    .listChapters(args.bookId)
    .filter((c) =>
      args.currentChapterId ? String(c.id) !== String(args.currentChapterId) : true,
    )
    .filter((c) =>
      Number.isFinite(args.targetChapterNumber)
        ? c.sort_order + 1 < Number(args.targetChapterNumber)
        : true,
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(-10);
  return chapters.map((c) => ({
    chapterId: c.id,
    chapterNumber: c.sort_order + 1,
    title: c.title,
    brief: compactBriefText(c.brief || c.body_markdown),
  }));
}

async function remoteBookChapterBriefContext(args: {
  bookId: string;
  currentChapterId?: string;
  targetChapterNumber?: number;
}): Promise<SuggestChapterBriefContext[]> {
  const remoteBook = await fetchRemoteJson<{
    book?: BookRecord & { chapters?: ChapterRecord[] };
  }>(`/api/books/${encodeURIComponent(args.bookId)}`);
  const refs = (remoteBook?.book?.chapters || [])
    .filter((c) =>
      args.currentChapterId ? String(c.id) !== String(args.currentChapterId) : true,
    )
    .filter((c) =>
      Number.isFinite(args.targetChapterNumber)
        ? c.sort_order + 1 < Number(args.targetChapterNumber)
        : true,
    )
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(-10);
  if (!refs.length) return [];
  const details = await Promise.all(
    refs.map(async (c) => {
      const payload = await fetchRemoteJson<{
        chapter?: ChapterRecord & { blocks?: Block[] };
      }>(`/api/chapters/${encodeURIComponent(c.id)}`);
      const chapter = payload?.chapter;
      if (!chapter) return null;
      return {
        chapterId: chapter.id,
        chapterNumber: chapter.sort_order + 1,
        title: chapter.title,
        brief: compactBriefText(chapter.brief || chapter.body_markdown),
      } as SuggestChapterBriefContext;
    }),
  );
  return details.filter((v): v is SuggestChapterBriefContext => Boolean(v));
}

function parseRunBrief(briefJson: string): BriefInput | null {
  try {
    const parsed = JSON.parse(briefJson) as BriefInput;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.brief !== "string" || !parsed.brief.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseRunState(
  stateJson: string | null | undefined,
): Record<string, string> {
  if (!stateJson) return {};
  try {
    const parsed = JSON.parse(stateJson) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const state: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") state[k] = v;
    }
    return state;
  } catch {
    return {};
  }
}

function listAllPipelineRunEvents(runId: string): PersistedPipelineRunEvent[] {
  const all: PersistedPipelineRunEvent[] = [];
  let after = 0;
  while (true) {
    const batch = store.listPipelineRunEvents(runId, after, 2000);
    if (!batch.length) break;
    all.push(...batch);
    after = batch[batch.length - 1]!.id;
    if (batch.length < 2000) break;
  }
  return all;
}

type ResumeCheckpoint = {
  sourceRunId: string;
  brief: BriefInput;
  state: Record<string, string>;
  nodeId: string;
  iteration: number;
};

function inferResumeCheckpoint(sourceRunId: string): ResumeCheckpoint | null {
  const run = store.getPipelineRun(sourceRunId);
  if (!run) return null;
  const brief = parseRunBrief(run.brief_json);
  if (!brief) return null;

  const state = parseRunState(run.state_json);
  if (!state.draft && run.draft) state.draft = run.draft;

  const events = listAllPipelineRunEvents(sourceRunId);
  let nextNode = config.workflow.entry;
  let iteration = 0;
  let inProgressNode: { nodeId: string; iteration: number } | null = null;

  for (const row of events) {
    const event = row.event;
    if (event.type === "node_started") {
      const nextIteration =
        typeof event.iteration === "number" && Number.isFinite(event.iteration)
          ? Math.max(0, Math.floor(event.iteration))
          : iteration;
      inProgressNode = { nodeId: event.nodeId, iteration: nextIteration };
      nextNode = event.nodeId;
      iteration = nextIteration;
      continue;
    }
    if (event.type === "node_finished") {
      inProgressNode = null;
      state[event.outputKey] = event.output;
      if (event.outputKey === "draft") state.draft = event.output;
      if (event.evaluation?.feedback) state.feedback = event.evaluation.feedback;
      continue;
    }
    if (event.type === "route") {
      if (
        typeof event.iteration === "number" &&
        Number.isFinite(event.iteration) &&
        event.iteration >= 0
      ) {
        iteration = Math.floor(event.iteration);
      }
      if (
        event.to !== config.workflow.end &&
        typeof event.to === "string" &&
        config.workflow.nodes[event.to]
      ) {
        nextNode = event.to;
      } else if (event.to === config.workflow.end) {
        nextNode = config.workflow.end;
      }
      continue;
    }
    if (event.type === "pipeline_finished") {
      if (event.draft) state.draft = event.draft;
      if (event.state && typeof event.state === "object") {
        for (const [k, v] of Object.entries(event.state)) {
          if (typeof v === "string") state[k] = v;
        }
      }
    }
  }

  let nodeId = nextNode;
  let resumeIteration = iteration;
  if (inProgressNode) {
    nodeId = inProgressNode.nodeId;
    resumeIteration = inProgressNode.iteration;
  }

  if (!config.workflow.nodes[nodeId]) {
    nodeId = config.workflow.entry;
  }
  if (nodeId === config.workflow.end) {
    nodeId =
      brief.mode === "revise_blocks" && config.workflow.nodes.write
        ? "write"
        : config.workflow.entry;
  }

  return {
    sourceRunId,
    brief,
    state,
    nodeId,
    iteration: resumeIteration,
  };
}

function supersedeRunningRun(runId: string, message: string): void {
  const run = store.getPipelineRun(runId);
  if (!run || run.status !== "running") return;
  const state = parseRunState(run.state_json);
  if (!state.draft && run.draft) state.draft = run.draft;
  const event: PipelineEvent = {
    type: "pipeline_finished",
    status: "error",
    draft: run.draft ?? undefined,
    state,
    error: message,
  };
  const persisted = store.appendPipelineRunEvent(runId, event);
  broadcastRunEvent(runId, persisted);
  store.finishPipelineRun({
    runId,
    status: "error",
    draft: run.draft ?? undefined,
    state,
    error: message,
  });
}

app.get("/api/health", async () => ({
  ok: true,
  mock,
  title: config.app.title,
  workflow: config.workflow.name,
  goal: config.goal.name,
  agents: Object.keys(config.agents),
  dataApiBase: dataApiBase || null,
  remoteData,
  sqlite: {
    path: store.path,
    durable: store.path !== ":memory:",
    articles: remoteData ? null : store.list(1000).length,
    books: remoteData ? null : store.listBooks(1000).length,
    seeded,
  },
}));

app.get("/api/config", async () => ({
  title: config.app.title,
  tagline: config.app.tagline,
  mock,
  dataApiBase,
  remoteData,
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

app.get("/api/runs/active", async () => {
  const runs = store
    .listActivePipelineRuns(20)
    .map((run) => {
      let brief: BriefInput | null = null;
      try {
        brief = JSON.parse(run.brief_json) as BriefInput;
      } catch {
        brief = null;
      }
      return {
        id: run.id,
        status: run.status,
        brief,
        created_at: run.created_at,
        updated_at: run.updated_at,
        finished_at: run.finished_at,
        lastEventId: store.getPipelineRunLastEventId(run.id),
      };
    })
    .filter((run) => run.brief?.runMode !== "background_chapter")
    .slice(0, 5);
  return { runs };
});

app.get<{ Params: { id: string } }>("/api/runs/:id", async (req, reply) => {
  const run = store.getPipelineRun(req.params.id);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  let brief: BriefInput | null = null;
  let evaluation: unknown = null;
  let state: Record<string, string> = {};
  try {
    brief = JSON.parse(run.brief_json) as BriefInput;
  } catch {
    brief = null;
  }
  try {
    evaluation = run.evaluation_json ? JSON.parse(run.evaluation_json) : null;
  } catch {
    evaluation = null;
  }
  try {
    state = run.state_json ? (JSON.parse(run.state_json) as Record<string, string>) : {};
  } catch {
    state = {};
  }
  return {
    run: {
      id: run.id,
      status: run.status,
      brief,
      draft: run.draft,
      evaluation,
      state,
      error: run.error,
      created_at: run.created_at,
      updated_at: run.updated_at,
      finished_at: run.finished_at,
      lastEventId: store.getPipelineRunLastEventId(run.id),
    },
  };
});

app.post<{
  Params: { id: string };
  Body: { force?: boolean };
}>("/api/runs/:id/resume", async (req, reply) => {
  const sourceRun = store.getPipelineRun(req.params.id);
  if (!sourceRun) return reply.code(404).send({ error: "Run not found" });

  if (sourceRun.status === "completed" || sourceRun.status === "max_iterations") {
    return reply.code(409).send({
      error:
        "Run already finished. Start a new run if you want additional processing.",
    });
  }

  const force = req.body?.force !== false;
  if (activeRunPromises.has(sourceRun.id)) {
    if (!force) {
      return reply.code(409).send({
        error: "Run is still active. Pass force=true to resume from a new run.",
      });
    }
    const controller = activeRunControllers.get(sourceRun.id);
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    // Abort does not always interrupt in-flight provider requests; detach now.
    activeRunControllers.delete(sourceRun.id);
    activeRunPromises.delete(sourceRun.id);
    supersedeRunningRun(
      sourceRun.id,
      "Run superseded by resume action.",
    );
  } else if (sourceRun.status === "running") {
    supersedeRunningRun(
      sourceRun.id,
      "Run marked stale and superseded by a resume action.",
    );
  }

  const checkpoint = inferResumeCheckpoint(sourceRun.id);
  if (!checkpoint) {
    return reply
      .code(400)
      .send({ error: "Could not restore checkpoint for this run." });
  }

  const resumedBrief = normalizeBriefInput({
    ...checkpoint.brief,
    existingDraft:
      checkpoint.state.draft ||
      sourceRun.draft ||
      checkpoint.brief.existingDraft ||
      "",
    resumeFromRunId: sourceRun.id,
    resumeFromNodeId: checkpoint.nodeId,
    resumeIteration: checkpoint.iteration,
  });

  const resumedRun = store.createPipelineRun(resumedBrief);
  launchPipelineRun(resumedRun.id, resumedBrief, {
    resume: {
      state: checkpoint.state,
      nodeId: checkpoint.nodeId,
      iteration: checkpoint.iteration,
    },
  });

  return reply.code(202).send({
    runId: resumedRun.id,
    resumedFromRunId: sourceRun.id,
    startNodeId: checkpoint.nodeId,
    iteration: checkpoint.iteration,
    status: "started",
  });
});

app.get<{
  Params: { id: string };
  Querystring: { after?: string; limit?: string };
}>("/api/runs/:id/events", async (req, reply) => {
  const run = store.getPipelineRun(req.params.id);
  if (!run) return reply.code(404).send({ error: "Run not found" });
  const after = Number(req.query.after ?? "0");
  const limit = Number(req.query.limit ?? "500");
  const events = store
    .listPipelineRunEvents(
      run.id,
      Number.isFinite(after) ? after : 0,
      Number.isFinite(limit) ? Math.max(1, Math.min(limit, 2000)) : 500,
    )
    .map((persisted) => ({
      id: persisted.id,
      created_at: persisted.createdAt,
      event: decorateRunEvent(persisted),
    }));
  return {
    run: {
      id: run.id,
      status: run.status,
      created_at: run.created_at,
      updated_at: run.updated_at,
      finished_at: run.finished_at,
    },
    events,
  };
});

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
  if (redirectToRemotePublicPage(reply, "/articles")) return;
  const html = renderArticlesIndex(publishedOnly());
  return reply.type("text/html; charset=utf-8").send(html);
});

app.get<{ Params: { slug: string } }>("/articles/:slug", async (req, reply) => {
  if (redirectToRemotePublicPage(reply, `/articles/${req.params.slug}`)) return;
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
  let books = store.listBooks(200).filter((b) => b.status === "published");
  if (remoteData) {
    const remote = await fetchRemoteJson<{
      books?: Array<{
        id: string;
        slug: string;
        title: string;
        synopsis?: string | null;
        theme?: string | null;
        status?: string;
        revision?: number;
        updated_at?: string;
        published_at?: string | null;
      }>;
    }>("/api/books");
    if (remote?.books) {
      books = remote.books
        .filter((b) => (b.status || "published") === "published")
        .map((b) => ({
          id: b.id,
          slug: b.slug,
          title: b.title,
          synopsis: b.synopsis ?? null,
          overview_markdown: "",
          overview_blocks_json: "[]",
          audience: null,
          tone: null,
          format: null,
          length: null,
          theme: b.theme ?? null,
          goal: null,
          status: b.status || "published",
          revision: b.revision || 1,
          created_at: b.updated_at || "",
          updated_at: b.updated_at || "",
          published_at: b.published_at ?? null,
        }));
    }
  }
  return reply
    .type("text/html; charset=utf-8")
    .send(renderBooksIndex(books));
});

app.get<{ Params: { bookSlug: string } }>(
  "/books/:bookSlug",
  async (req, reply) => {
    if (remoteData) {
      const remote = await fetchRemoteJson<{
        book?: BookRecord & { chapters?: ChapterRecord[] };
      }>(`/api/books/${encodeURIComponent(req.params.bookSlug)}`);
      const book = remote?.book;
      if (!book || book.status !== "published") {
        return reply
          .code(404)
          .type("text/html; charset=utf-8")
          .send(renderBookNotFound(`/books/${req.params.bookSlug}`));
      }
      const chapters = (book.chapters || []).filter(
        (c) => c.status === "published",
      );
      return reply
        .type("text/html; charset=utf-8")
        .send(renderBookPage(book, chapters));
    }
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
    if (remoteData) {
      const remoteBook = await fetchRemoteJson<{
        book?: BookRecord & { chapters?: ChapterRecord[] };
      }>(`/api/books/${encodeURIComponent(req.params.bookSlug)}`);
      const book = remoteBook?.book;
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
      const siblings = (book.chapters || []).filter(
        (c) => c.status === "published",
      );
      const chapterRef = siblings.find((c) => c.slug === req.params.chapterSlug);
      if (!chapterRef) {
        return reply
          .code(404)
          .type("text/html; charset=utf-8")
          .send(
            renderBookNotFound(
              `/books/${req.params.bookSlug}/${req.params.chapterSlug}`,
            ),
          );
      }
      const remoteChapter = await fetchRemoteJson<{
        chapter?: ChapterRecord & { blocks?: Block[] };
      }>(`/api/chapters/${encodeURIComponent(chapterRef.id)}`);
      const chapter = remoteChapter?.chapter;
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
      return reply
        .type("text/html; charset=utf-8")
        .send(renderChapterPage(book, chapter, chapter.blocks || [], siblings));
    }
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
    const traceId = `sg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const logSuggestTrace = (event: SuggestTraceEvent): void => {
      switch (event.phase) {
        case "prompt":
          app.log.info(
            {
              traceId,
              phase: event.phase,
              prompt: event.prompt,
            },
            "suggest-trace",
          );
          return;
        case "model_attempt":
          app.log.info(
            {
              traceId,
              phase: event.phase,
              attempt: event.attempt,
              totalAttempts: event.totalAttempts,
              model: event.model,
            },
            "suggest-trace",
          );
          return;
        case "model_error":
          app.log.warn(
            {
              traceId,
              phase: event.phase,
              attempt: event.attempt,
              totalAttempts: event.totalAttempts,
              model: event.model,
              error: event.error,
            },
            "suggest-trace",
          );
          return;
        case "model_response":
          app.log.info(
            {
              traceId,
              phase: event.phase,
              attempt: event.attempt,
              totalAttempts: event.totalAttempts,
              model: event.model,
              runStatus: event.runStatus,
              rawResponse: event.rawResponse,
            },
            "suggest-trace",
          );
          return;
        case "normalized":
          app.log.info(
            {
              traceId,
              phase: event.phase,
              suggestion: event.suggestion,
            },
            "suggest-trace",
          );
          return;
        case "mock":
          app.log.warn(
            {
              traceId,
              phase: event.phase,
              detail: event.detail,
            },
            "suggest-trace",
          );
          return;
      }
    };
    let bookId = body.bookId;
    if (!bookId && body.chapterId) {
      if (remoteData) {
        const remoteChapter = await fetchRemoteJson<{
          chapter?: ChapterRecord & {
            book?: { id: string; slug: string; title: string };
          };
        }>(`/api/chapters/${encodeURIComponent(body.chapterId)}`);
        bookId = remoteChapter?.chapter?.book?.id;
      } else {
        const localChapter = store.getChapter(body.chapterId);
        bookId = localChapter?.book_id;
      }
    }
    const fromClient = (body.existingChapterBriefs || [])
      .map((c) => ({
        chapterId: c.chapterId,
        chapterNumber: c.chapterNumber,
        title: c.title || "Chapter",
        brief: compactBriefText(c.brief),
      }))
      .filter((c) => c.brief);
    let fromStore: SuggestChapterBriefContext[] = [];
    if (bookId) {
      fromStore = remoteData
        ? await remoteBookChapterBriefContext({
            bookId,
            currentChapterId: body.chapterId,
            targetChapterNumber: body.chapterNumber,
          })
        : localBookChapterBriefContext({
            bookId,
            currentChapterId: body.chapterId,
            targetChapterNumber: body.chapterNumber,
          });
    }
    const existingChapterBriefs = mergeSuggestChapterContexts(fromStore, fromClient);
    const suggestion = await suggestBrief({
      input: {
        bookId,
        chapterId: body.chapterId,
        bookTitle: body.bookTitle,
        bookSynopsis: body.bookSynopsis,
        chapterTitle: body.chapterTitle,
        chapterNumber: body.chapterNumber,
        existingTheme: body.existingTheme,
        existingGoal: body.existingGoal,
        existingChapterBriefs,
      },
      mock,
      client,
      config,
      onTrace: logSuggestTrace,
    });
    return { suggestion, mock };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply.code(502).send({ error: message });
  }
});

app.post<{
  Params: { id: string };
  Body: BriefInput;
}>("/api/chapters/:id/run", async (req, reply) => {
  let chapter:
    | (ChapterRecord & {
        book?: { id: string; slug: string; title: string };
      })
    | null = null;
  let book: { id: string; slug: string; title: string } | null = null;
  if (remoteData) {
    const remoteChapter = await fetchRemoteJson<{
      chapter?: ChapterRecord & {
        book?: { id: string; slug: string; title: string };
      };
    }>(`/api/chapters/${encodeURIComponent(req.params.id)}`);
    chapter = remoteChapter?.chapter ?? null;
    book = chapter?.book ?? null;
  } else {
    const localChapter = store.getChapter(req.params.id);
    if (localChapter) {
      chapter = localChapter;
      const localBook = store.getBook(localChapter.book_id);
      if (localBook) {
        book = {
          id: localBook.id,
          slug: localBook.slug,
          title: localBook.title,
        };
      }
    }
  }
  if (!chapter) return reply.code(404).send({ error: "Chapter not found" });
  if (!book) return reply.code(404).send({ error: "Book not found" });

  const body = req.body ?? ({} as BriefInput);
  const resolvedBrief =
    (typeof body.brief === "string" && body.brief.trim()) ||
    chapter.brief ||
    `Write ${chapter.title} of "${book.title}" with practical examples and clear exercises.`;

  const brief = normalizeBriefInput({
    brief: resolvedBrief,
    audience: body.audience ?? chapter.audience ?? undefined,
    tone: body.tone ?? chapter.tone ?? undefined,
    format: body.format ?? chapter.format ?? undefined,
    length: body.length ?? chapter.length ?? undefined,
    theme: body.theme ?? chapter.theme ?? undefined,
    goal: body.goal ?? chapter.goal ?? undefined,
    mode: body.mode,
    existingDraft: body.existingDraft ?? chapter.body_markdown,
    selectedBlocks: body.selectedBlocks,
    reviseInstruction: body.reviseInstruction,
    bookTitle: body.bookTitle ?? book.title,
    chapterId: chapter.id,
    chapterTitle: body.chapterTitle ?? chapter.title,
    chapterNumber:
      body.chapterNumber != null ? body.chapterNumber : chapter.sort_order + 1,
    runMode: "background_chapter",
  });

  const run = store.createPipelineRun(brief);
  launchPipelineRun(run.id, brief, {
    onDraft: async (draft) => {
      await persistChapterDraftCheckpoint({
        chapterId: chapter.id,
        brief,
        runId: run.id,
        draft,
        changeSummary: `Background chapter autosave ${run.id.slice(0, 8)}`,
      });
    },
    onFinished: async (result) => {
      if (
        (result.status === "completed" || result.status === "max_iterations") &&
        result.draft?.trim()
      ) {
        await persistChapterDraftCheckpoint({
          chapterId: chapter.id,
          brief,
          runId: run.id,
          draft: result.draft,
          changeSummary: `Background chapter run ${run.id.slice(0, 8)} · ${result.status}`,
        });
      }
    },
  });

  return reply.code(202).send({
    runId: run.id,
    chapterId: chapter.id,
    status: "started",
  });
});

app.post<{ Body: BriefInput }>("/api/run", async (req, reply) => {
  const body = req.body ?? ({} as BriefInput);
  if (!body.brief || typeof body.brief !== "string" || !body.brief.trim()) {
    return reply.code(400).send({ error: "brief is required" });
  }
  const brief = normalizeBriefInput({
    ...body,
    runMode: body.runMode ?? "interactive",
  });
  const run = store.createPipelineRun(brief);
  const canPersistChapterDraft =
    brief.mode !== "revise_blocks" && typeof brief.chapterId === "string";
  launchPipelineRun(run.id, brief, canPersistChapterDraft
    ? {
        onDraft: async (draft) => {
          await persistChapterDraftCheckpoint({
            chapterId: brief.chapterId!,
            brief,
            runId: run.id,
            draft,
            changeSummary: `Interactive chapter autosave ${run.id.slice(0, 8)}`,
          });
        },
        onFinished: async (result) => {
          if (!result.draft?.trim()) return;
          await persistChapterDraftCheckpoint({
            chapterId: brief.chapterId!,
            brief,
            runId: run.id,
            draft: result.draft,
            changeSummary: `Interactive chapter run ${run.id.slice(0, 8)} · ${result.status}`,
          });
        },
      }
    : undefined);

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Run-Id": run.id,
  });
  const stopHeartbeat = startSseHeartbeat(reply.raw);
  let closed = false;
  let lastSentEventId = 0;

  const send = (event: PipelineEventEnvelope) => {
    if (closed || reply.raw.destroyed || reply.raw.writableEnded) return false;
    reply.raw.write(`event: ${event.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  };

  let unsubscribe = () => {};
  const closeStream = () => {
    if (closed) return;
    closed = true;
    unsubscribe();
    stopHeartbeat();
    if (!reply.raw.destroyed && !reply.raw.writableEnded) {
      reply.raw.end();
    }
  };

  const sendPersisted = (persisted: PersistedPipelineRunEvent) => {
    if (persisted.id <= lastSentEventId) return;
    lastSentEventId = persisted.id;
    const ok = send(decorateRunEvent(persisted));
    if (!ok) {
      closeStream();
      return;
    }
    if (persisted.event.type === "pipeline_finished") {
      closeStream();
    }
  };

  const replayPersisted = (afterEventId: number) => {
    const events = store.listPipelineRunEvents(run.id, afterEventId, 2000);
    for (const persisted of events) {
      sendPersisted(persisted);
      if (closed) return;
    }
  };

  unsubscribe = subscribeRun(run.id, sendPersisted);
  // Replay twice to safely bridge the brief subscribe window.
  replayPersisted(0);
  if (!closed) {
    replayPersisted(lastSentEventId);
  }
  if (!closed) {
    const latest = store.getPipelineRun(run.id);
    if (latest && latest.status !== "running") {
      closeStream();
    }
  }

  reply.raw.on("close", closeStream);
  reply.raw.on("error", closeStream);
});

await app.register(fastifyStatic, {
  root: publicDir,
  prefix: "/",
});

const shutdown = () => {
  for (const controller of activeRunControllers.values()) {
    if (!controller.signal.aborted) controller.abort();
  }
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
    dataApiBase: dataApiBase || "(same-origin)",
    remoteData,
    seeded,
    diagramsBackfilled,
  },
  "writing-agent listening",
);
void validateSuggestModelConfigOnStartup();
