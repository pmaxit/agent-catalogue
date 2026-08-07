/**
 * AI suggestions that pre-fill studio brief & parameters from book/chapter context.
 */

import {
  CursorApiError,
  type CursorClient,
  type CursorModel,
} from "./cursor-client.js";
import type { PipelineConfig } from "./types.js";
import { isOreillyChapterTheme } from "./themes.js";

export type SuggestBriefInput = {
  bookId?: string;
  chapterId?: string;
  bookTitle?: string;
  bookSynopsis?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  existingTheme?: string;
  existingGoal?: string;
  existingChapterBriefs?: Array<{
    chapterId?: string;
    chapterNumber?: number;
    title: string;
    brief: string;
  }>;
};

export type SuggestBriefResult = {
  brief: string;
  audience: string;
  tone: string;
  format: string;
  length: string;
  theme: string;
  goal: string;
  rationale: string;
};

export type SuggestTraceEvent =
  | {
      phase: "mock";
      detail: string;
    }
  | {
      phase: "prompt";
      prompt: string;
    }
  | {
      phase: "model_attempt";
      model: CursorModel;
      attempt: number;
      totalAttempts: number;
    }
  | {
      phase: "model_error";
      model: CursorModel;
      attempt: number;
      totalAttempts: number;
      error: string;
    }
  | {
      phase: "model_response";
      model: CursorModel;
      attempt: number;
      totalAttempts: number;
      runStatus: string;
      rawResponse: string;
    }
  | {
      phase: "normalized";
      suggestion: SuggestBriefResult;
    };

function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced?.[1] ?? text).trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Model did not return JSON");
  }
}

function asString(v: unknown, fallback: string): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

export function normalizeSuggestResult(
  raw: unknown,
  input: SuggestBriefInput,
): SuggestBriefResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const fallback = mockSuggestBrief(input);
  return {
    brief: asString(obj.brief, fallback.brief),
    audience: asString(obj.audience, fallback.audience),
    tone: asString(obj.tone, fallback.tone),
    format: asString(obj.format, fallback.format),
    length: asString(obj.length, fallback.length),
    theme: asString(obj.theme, fallback.theme),
    goal: asString(obj.goal, fallback.goal),
    rationale: asString(obj.rationale, fallback.rationale),
  };
}

export function mockSuggestBrief(input: SuggestBriefInput): SuggestBriefResult {
  const book = input.bookTitle?.trim() || "";
  const chapter =
    input.chapterTitle?.trim() ||
    (input.chapterNumber
      ? `Chapter ${input.chapterNumber}`
      : book
        ? "Opening chapter"
        : "Untitled piece");
  const synopsis = input.bookSynopsis?.trim() || "";
  const bookCtx = Boolean(book);
  const preferOreilly =
    bookCtx ||
    isOreillyChapterTheme(input.existingTheme, undefined) ||
    (input.existingGoal ?? "").toLowerCase().includes("o'reilly") ||
    (input.existingGoal ?? "").toLowerCase().includes("book chapter");
  const priorChapters = (input.existingChapterBriefs || [])
    .filter((c) => c?.brief?.trim())
    .slice(0, 8);
  const priorContext = priorChapters
    .map((c) =>
      `${c.chapterNumber != null ? `Ch ${c.chapterNumber}: ` : ""}${c.title} — ${c.brief}`,
    )
    .join(" | ");

  if (preferOreilly || bookCtx) {
    const topicHint = synopsis
      ? ` grounded in this book promise: ${synopsis.slice(0, 280)}`
      : "";
    const progressionHint = priorContext
      ? ` Advance beyond prior chapter coverage (${priorContext.slice(0, 420)}).`
      : "";
    return {
      brief: [
        `Write “${chapter}”${book ? ` for the O’Reilly-style book “${book}”` : ""}.`,
        `Teach one practical skill a working practitioner can apply immediately${topicHint}.${progressionHint}`,
        `Include a warm-up problem, core concepts, hands-on walkthrough with code + output, at least one architecture diagram brief, common pitfalls, exercises, and a summary.`,
        `Make examples concrete to “${chapter}” — avoid generic filler that could fit any book.`,
      ].join(" "),
      audience: "Working practitioners and intermediate engineers learning by doing",
      tone: "practical, example-first, authoritative yet approachable, you-addressed",
      format: "O'Reilly-Style Book Chapter",
      length: "4000–5500 words (full book chapter)",
      theme: "O'Reilly Book Chapter",
      goal: "O'Reilly-Style Technical Book Chapter",
      rationale: book
        ? `Matched “${book}” / “${chapter}” to a full O’Reilly chapter shape so labs and callouts fit the book.`
        : `Chose O’Reilly chapter shape for a complete, example-first technical chapter on “${chapter}”.`,
    };
  }

  return {
    brief: `Write a focused piece titled “${chapter}”${book ? ` related to “${book}”` : ""}. Lead with the outcome, support with evidence, and end with concrete next steps.`,
    audience: "Engineering leads & product directors",
    tone: "precise, delegated, outcome-first, traceable",
    format: "Long-form Agentic Essay",
    length: "1000–1500 words",
    theme: "Agentic Command",
    goal: "Long-form Agentic Essay",
    rationale: `Defaulted to Agentic Command for “${chapter}” — outcome-first voice without a book-chapter brief.`,
  };
}

export function buildSuggestPrompt(input: SuggestBriefInput): string {
  const priorChapterLines = (input.existingChapterBriefs || [])
    .filter((c) => c?.brief?.trim())
    .slice(0, 10)
    .map((c, i) => {
      const ordinal =
        c.chapterNumber != null ? `Chapter ${c.chapterNumber}` : `Prior ${i + 1}`;
      const cid = c.chapterId ? ` (${c.chapterId.slice(0, 8)})` : "";
      return `- ${ordinal}${cid}: ${c.title}\n  Brief/topic: ${c.brief}`;
    })
    .join("\n");

  return `You are Quill's briefing coach. Return fast, high-signal defaults.

Context:
- Book title: ${input.bookTitle?.trim() || "(none)"}
- Book synopsis: ${input.bookSynopsis?.trim() || "(none)"}
- Chapter title: ${input.chapterTitle?.trim() || "(none)"}
- Chapter number: ${input.chapterNumber ?? "(none)"}
- Current theme: ${input.existingTheme?.trim() || "(none)"}
- Current goal: ${input.existingGoal?.trim() || "(none)"}
${priorChapterLines ? `\nPrior chapter briefs in this same book:\n${priorChapterLines}` : "\nPrior chapter briefs in this same book:\n(none provided)"}

Rules:
1. Be explicit and specific to the book name and chapter title — never generic filler that could apply to any book.
2. If book title exists, prefer O'Reilly Book Chapter + full chapter length.
3. Brief must include topic + reader outcome; for O'Reilly include warm-up, labs, pitfalls, exercises.
4. audience/tone/format/length must align with chosen theme.
5. rationale must be one short sentence.
6. Use prior chapter briefs to avoid overlap and propose the next incremental skill/topic.
7. Explicitly mention what this chapter adds that prior chapters did NOT cover.
8. Avoid boilerplate like "cover the next practical topic" unless it names that topic concretely.

Return ONLY valid JSON with keys:
brief, audience, tone, format, length, theme, goal, rationale

theme must be one of:
"Agentic Command", "Technical Trace", "Editorial Signal", "Narrative Pulse", "Executive Crisp", "O'Reilly Book Chapter"

goal must match a studio goal label (use "O'Reilly-Style Technical Book Chapter" when theme is O'Reilly).`;
}

function suggestModel(config: PipelineConfig): { id: string } {
  // Keep suggest-brief on a fast model path, independently from writer models.
  return { id: config.api.suggest_model };
}

function parseBracketModel(raw: string): CursorModel | null {
  const m = raw.match(/^([^\[\]]+)\[([^\]]*)\]$/);
  if (!m) return null;
  const id = m[1]?.trim();
  const paramsRaw = m[2]?.trim() ?? "";
  if (!id) return null;
  if (!paramsRaw) return { id };
  const params = paramsRaw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const eq = part.indexOf("=");
      if (eq < 0) return { id: part, value: "true" };
      const key = part.slice(0, eq).trim();
      const value = part.slice(eq + 1).trim();
      return { id: key, value };
    })
    .filter((p) => p.id);
  return { id, ...(params.length ? { params } : {}) };
}

function normalizeModelSelection(raw: string): CursorModel {
  const parsed = parseBracketModel(raw);
  if (parsed) return parsed;
  if (/^composer-[\d.]+-fast$/i.test(raw)) {
    const baseId = raw.replace(/-fast$/i, "");
    return { id: baseId, params: [{ id: "fast", value: "true" }] };
  }
  return { id: raw };
}

function modelSelectionKey(model: CursorModel): string {
  const params = (model.params || [])
    .map((p) => `${p.id}=${p.value}`)
    .sort()
    .join("&");
  return `${model.id}|${params}`;
}

export function suggestModelCandidates(config: PipelineConfig): CursorModel[] {
  const orderedIds = [
    suggestModel(config).id,
    config.defaults.model.id,
    "composer-2.5-fast",
    "composer-2.5",
  ]
    .map((id) => String(id || "").trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const unique: CursorModel[] = [];
  for (const id of orderedIds) {
    const model = normalizeModelSelection(id);
    const key = modelSelectionKey(model);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(model);
  }
  return unique;
}

function suggestTimeoutMs(config: PipelineConfig): number {
  const target = Math.max(5000, config.api.suggest_timeout_ms);
  return Math.min(config.api.run_timeout_ms, target);
}

function ensureContextSpecificity(
  suggestion: SuggestBriefResult,
  input: SuggestBriefInput,
): SuggestBriefResult {
  const book = input.bookTitle?.trim();
  const chapter = input.chapterTitle?.trim();
  let brief = suggestion.brief;
  if (book && !new RegExp(book.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(brief)) {
    brief = `${brief} Anchor this chapter explicitly to the book “${book}”.`;
  }
  if (
    chapter &&
    !new RegExp(chapter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(brief)
  ) {
    brief = `${brief} Focus specifically on chapter topic “${chapter}”.`;
  }
  return { ...suggestion, brief: brief.trim() };
}

async function runSuggestModel(args: {
  client: CursorClient;
  config: PipelineConfig;
  prompt: string;
  onTrace?: (event: SuggestTraceEvent) => void;
}): Promise<unknown> {
  const candidates = suggestModelCandidates(args.config);
  const failures: string[] = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i]!;
    const attempt = i + 1;
    const modelLabel = modelSelectionKey(model);
    args.onTrace?.({
      phase: "model_attempt",
      model,
      attempt,
      totalAttempts: candidates.length,
    });
    try {
      const created = await args.client.createAgent({
        prompt: { text: args.prompt },
        model,
        name: "Quill brief suggest",
        mode: "agent",
      });
      const agentId = created.agent.id;
      const runId = created.run.id;
      const run = await args.client.waitForRun(agentId, runId, {
        pollIntervalMs: Math.min(args.config.api.poll_interval_ms, 1000),
        timeoutMs: suggestTimeoutMs(args.config),
      });
      const rawResponse = run.result ?? "";
      args.onTrace?.({
        phase: "model_response",
        model,
        attempt,
        totalAttempts: candidates.length,
        runStatus: run.status,
        rawResponse,
      });
      if (run.status !== "FINISHED") {
        throw new Error(`Suggest run ended with ${run.status}`);
      }
      return extractJsonObject(rawResponse);
    } catch (err) {
      const isApiErr = err instanceof CursorApiError;
      const retriable =
        isApiErr &&
        (err.status === 400 || err.status === 404 || err.status === 422);
      const detail = isApiErr
        ? `${err.message}${err.body ? `: ${err.body}` : ""}`
        : err instanceof Error
          ? err.message
          : String(err);
      args.onTrace?.({
        phase: "model_error",
        model,
        attempt,
        totalAttempts: candidates.length,
        error: detail,
      });
      failures.push(`${modelLabel}: ${detail}`);
      if (!retriable || i === candidates.length - 1) {
        throw new Error(
          `Suggest request failed after trying models (${candidates.map(modelSelectionKey).join(", ")}). Attempts: ${failures.join(" || ")}`,
        );
      }
    }
  }
  throw new Error("Suggest request failed: no model candidates available");
}

export async function suggestBrief(options: {
  input: SuggestBriefInput;
  mock: boolean;
  client: CursorClient | null;
  config: PipelineConfig;
  onTrace?: (event: SuggestTraceEvent) => void;
}): Promise<SuggestBriefResult> {
  const { input, mock, client, config, onTrace } = options;
  if (mock || !client) {
    onTrace?.({
      phase: "mock",
      detail: mock ? "mock mode enabled" : "client unavailable",
    });
    return mockSuggestBrief(input);
  }

  const prompt = buildSuggestPrompt(input);
  onTrace?.({ phase: "prompt", prompt });
  const parsed = await runSuggestModel({ client, config, prompt, onTrace });
  const normalized = ensureContextSpecificity(
    normalizeSuggestResult(parsed, input),
    input,
  );
  onTrace?.({ phase: "normalized", suggestion: normalized });
  return normalized;
}
