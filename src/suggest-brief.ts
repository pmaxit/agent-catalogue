/**
 * AI suggestions that pre-fill studio brief & parameters from book/chapter context.
 */

import type { CursorClient } from "./cursor-client.js";
import type { PipelineConfig } from "./types.js";
import { isOreillyChapterTheme } from "./themes.js";

export type SuggestBriefInput = {
  bookTitle?: string;
  bookSynopsis?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  existingTheme?: string;
  existingGoal?: string;
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

  if (preferOreilly || bookCtx) {
    const topicHint = synopsis
      ? ` grounded in this book promise: ${synopsis.slice(0, 280)}`
      : "";
    return {
      brief: [
        `Write “${chapter}”${book ? ` for the O’Reilly-style book “${book}”` : ""}.`,
        `Teach one practical skill a working practitioner can apply immediately${topicHint}.`,
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
  return `You are Quill's briefing coach. Propose the BEST studio parameters for stronger writing content.

Context:
- Book title: ${input.bookTitle?.trim() || "(none)"}
- Book synopsis: ${input.bookSynopsis?.trim() || "(none)"}
- Chapter title: ${input.chapterTitle?.trim() || "(none)"}
- Chapter number: ${input.chapterNumber ?? "(none)"}
- Current theme: ${input.existingTheme?.trim() || "(none)"}
- Current goal: ${input.existingGoal?.trim() || "(none)"}

Rules:
1. Be explicit and specific to the book name and chapter title — never generic filler that could apply to any book.
2. If a book title is present, prefer O'Reilly Book Chapter theme/goal and a full-chapter length unless the synopsis clearly demands otherwise.
3. The brief must name the chapter topic, the reader outcome, and required sections (warm-up, labs, pitfalls, exercises) when O'Reilly is chosen.
4. audience, tone, format, length must reinforce the theme selection.
5. rationale must be one sentence explaining why these choices improve content for THIS selection.

Return ONLY valid JSON with keys:
brief, audience, tone, format, length, theme, goal, rationale

theme must be one of:
"Agentic Command", "Technical Trace", "Editorial Signal", "Narrative Pulse", "Executive Crisp", "O'Reilly Book Chapter"

goal must match a studio goal label (use "O'Reilly-Style Technical Book Chapter" when theme is O'Reilly).`;
}

export async function suggestBrief(options: {
  input: SuggestBriefInput;
  mock: boolean;
  client: CursorClient | null;
  config: PipelineConfig;
}): Promise<SuggestBriefResult> {
  const { input, mock, client, config } = options;
  if (mock || !client) {
    return mockSuggestBrief(input);
  }

  const prompt = buildSuggestPrompt(input);
  const model = config.defaults.model;
  const created = await client.createAgent({
    prompt: { text: prompt },
    model,
    name: "Quill brief suggest",
    mode: "agent",
  });
  const agentId = created.agent.id;
  const runId = created.run.id;
  const run = await client.waitForRun(agentId, runId, {
    pollIntervalMs: Math.min(config.api.poll_interval_ms, 2000),
    timeoutMs: Math.min(config.api.run_timeout_ms, 120_000),
  });
  if (run.status !== "FINISHED") {
    throw new Error(`Suggest run ended with ${run.status}`);
  }
  const parsed = extractJsonObject(run.result ?? "");
  return normalizeSuggestResult(parsed, input);
}
