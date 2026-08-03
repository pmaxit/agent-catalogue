import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSuggestPrompt,
  mockSuggestBrief,
  normalizeSuggestResult,
  suggestBrief,
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

test("suggestBrief uses mock path when mock=true", async () => {
  const suggestion = await suggestBrief({
    input: {
      bookTitle: "Test Book",
      chapterTitle: "Chapter 1",
    },
    mock: true,
    client: null,
    config: { defaults: { model: { id: "x" } }, api: {} } as PipelineConfig,
  });
  assert.equal(suggestion.theme, "O'Reilly Book Chapter");
});
