import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSuggestPrompt,
  mockSuggestBrief,
  normalizeSuggestResult,
  suggestBrief,
  suggestModelCandidates,
} from "../src/suggest-brief.js";
import type { PipelineConfig } from "../src/types.js";

test("mockSuggestBrief prefers O'Reilly when book title is present", () => {
  const suggestion = mockSuggestBrief({
    bookTitle: "Designing Agent Pipelines",
    bookSynopsis: "Hands-on book for building reliable agent workflows.",
    chapterTitle: "Chapter 2: Memory stores",
    chapterNumber: 2,
  });
  assert.equal(suggestion.theme, "O'Reilly Book Chapter");
  assert.equal(suggestion.goal, "O'Reilly-Style Technical Book Chapter");
  assert.match(suggestion.brief, /Designing Agent Pipelines/);
  assert.match(suggestion.brief, /Memory stores/);
  assert.match(suggestion.length, /4000/);
  assert.match(suggestion.rationale, /Designing Agent Pipelines|Memory stores/);
});

test("mockSuggestBrief falls back to Agentic without book context", () => {
  const suggestion = mockSuggestBrief({
    chapterTitle: "Why eval loops matter",
  });
  assert.equal(suggestion.theme, "Agentic Command");
  assert.match(suggestion.brief, /eval loops/);
});

test("normalizeSuggestResult fills missing keys from mock", () => {
  const normalized = normalizeSuggestResult(
    { brief: "Only brief" },
    { bookTitle: "Agents at Work", chapterTitle: "Intro" },
  );
  assert.equal(normalized.brief, "Only brief");
  assert.equal(normalized.theme, "O'Reilly Book Chapter");
});

test("buildSuggestPrompt requires explicit book/chapter specificity", () => {
  const prompt = buildSuggestPrompt({
    bookTitle: "Quill Playbook",
    chapterTitle: "Streaming SSE",
  });
  assert.match(prompt, /Quill Playbook/);
  assert.match(prompt, /Streaming SSE/);
  assert.match(prompt, /never generic filler/i);
  assert.match(prompt, /Return ONLY valid JSON/);
});

test("buildSuggestPrompt includes prior chapter context", () => {
  const prompt = buildSuggestPrompt({
    bookTitle: "Reinforcement Learning",
    chapterTitle: "Chapter 4",
    existingChapterBriefs: [
      {
        chapterId: "abc123",
        chapterNumber: 1,
        title: "Chapter 1",
        brief: "MDPs and Bellman equations",
      },
      {
        chapterId: "def456",
        chapterNumber: 2,
        title: "Chapter 2",
        brief: "Policy iteration and value iteration",
      },
    ],
  });
  assert.match(prompt, /Prior chapter briefs in this same book/i);
  assert.match(prompt, /MDPs and Bellman equations/);
  assert.match(prompt, /avoid overlap/i);
});

test("suggestBrief uses mock path when mock=true", async () => {
  const suggestion = await suggestBrief({
    input: {
      bookTitle: "Test Book",
      chapterTitle: "Chapter 1",
    },
    mock: true,
    config: { defaults: { model: { id: "x" } }, api: {} } as PipelineConfig,
  });
  assert.equal(suggestion.theme, "O'Reilly Book Chapter");
});

test("suggestModelCandidates includes fallback models without duplicates", () => {
  const candidates = suggestModelCandidates({
    api: {
      suggest_model: "gemini-flash-latest",
    },
    defaults: {
      model: { id: "composer-2.5" },
    },
  } as PipelineConfig);
  assert.deepEqual(candidates, [
    { id: "gemini-flash-latest" },
    { id: "gemini-3.6-flash" },
    { id: "gemini-2.5-flash" },
    { id: "gemini-2.5-flash-lite" },
    { id: "gemini-2.0-flash" },
    { id: "gemini-1.5-flash" },
  ]);
});

test("suggestModelCandidates deduplicates configured fallback model", () => {
  const candidates = suggestModelCandidates({
    api: {
      suggest_model: "gemini-2.0-flash",
    },
    defaults: {
      model: { id: "composer-2.5" },
    },
  } as PipelineConfig);
  assert.deepEqual(candidates, [
    { id: "gemini-2.0-flash" },
    { id: "gemini-flash-latest" },
    { id: "gemini-3.6-flash" },
    { id: "gemini-2.5-flash" },
    { id: "gemini-2.5-flash-lite" },
    { id: "gemini-1.5-flash" },
  ]);
});
