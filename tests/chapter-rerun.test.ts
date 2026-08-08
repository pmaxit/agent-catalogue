import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import type { CursorClient } from "../src/cursor-client.js";
import { WritingOrchestrator } from "../src/orchestrator.js";

const REVISE_EVALUATION = JSON.stringify({
  scores: {
    correctness: 0.1,
    clarity: 0.1,
    helpfulness: 0.1,
    code_output: 0.1,
    visual_feedback: 0.1,
    addictive: 0.1,
    style_fidelity: 0.1,
  },
  passed: false,
  route: "revise",
  feedback: "needs work",
  summary: "revise",
});

type CapturedPrompt = { name: string; prompt: string };

/** Stub Cursor client that records prompts and returns canned agent output. */
function makeStubClient(captured: CapturedPrompt[]): CursorClient {
  let counter = 0;
  const agentNames = new Map<string, string>();

  const outputFor = (name: string): string => {
    if (name.startsWith("Planner")) return "PLANNER-OUTPUT";
    if (name.startsWith("Manager")) return REVISE_EVALUATION;
    if (name.startsWith("Writer")) return "WRITER-OUTPUT";
    return "RESEARCH-OUTPUT";
  };

  const stub = {
    async createAgent(payload: { prompt: { text: string }; name?: string }) {
      counter += 1;
      const id = `agent-${counter}`;
      const name = payload.name ?? "";
      agentNames.set(id, name);
      captured.push({ name, prompt: payload.prompt.text });
      return {
        agent: { id, name, status: "RUNNING" },
        run: { id: `run-${counter}`, agentId: id, status: "RUNNING" },
      };
    },
    async streamRun(agentId: string) {
      return {
        text: outputFor(agentNames.get(agentId) ?? ""),
        status: "FINISHED",
      };
    },
  };
  return stub as unknown as CursorClient;
}

function writerPrompts(captured: CapturedPrompt[]): string[] {
  return captured
    .filter((p) => p.name.startsWith("Writer"))
    .map((p) => p.prompt);
}

test("fresh chapter run keeps only the existing draft; rest of state starts clean", async () => {
  const config = loadConfig();
  const captured: CapturedPrompt[] = [];
  const orchestrator = new WritingOrchestrator(
    config,
    makeStubClient(captured),
    false,
  );

  const result = await orchestrator.run({
    brief: {
      brief: "Rewrite chapter 2 with better exercises",
      chapterId: "ch-2",
      chapterTitle: "Chapter Two",
      existingDraft: "SEEDED-CHAPTER-DRAFT previous chapter body",
    },
  });

  assert.equal(result.status, "max_iterations");

  const writers = writerPrompts(captured);
  assert.ok(writers.length >= 2, "writer should run at least twice");

  // First write: prior chapter draft is the ONLY carried-over state.
  assert.match(writers[0]!, /Previous draft to revise/);
  assert.match(writers[0]!, /SEEDED-CHAPTER-DRAFT/);
  assert.match(writers[0]!, /PLANNER-OUTPUT/, "plan must come from this run");
  assert.doesNotMatch(
    writers[0]!,
    /Manager feedback to address/,
    "no stale feedback on a fresh run",
  );

  // After the first revise loop, the new draft replaces the seed.
  assert.match(writers[1]!, /WRITER-OUTPUT/);
  assert.doesNotMatch(writers[1]!, /SEEDED-CHAPTER-DRAFT/);
  assert.match(writers[1]!, /needs work/);
});

test("fresh run without an existing draft starts with no draft context", async () => {
  const config = loadConfig();
  const captured: CapturedPrompt[] = [];
  const orchestrator = new WritingOrchestrator(
    config,
    makeStubClient(captured),
    false,
  );

  await orchestrator.run({
    brief: { brief: "Write a brand new chapter" },
  });

  const writers = writerPrompts(captured);
  assert.ok(writers.length >= 1);
  assert.doesNotMatch(writers[0]!, /Previous draft to revise/);
});

test("revise_blocks mode does not seed the compose draft slot", async () => {
  const config = loadConfig();
  const captured: CapturedPrompt[] = [];
  const orchestrator = new WritingOrchestrator(
    config,
    makeStubClient(captured),
    false,
  );

  await orchestrator.run({
    brief: {
      brief: "Tighten the intro",
      mode: "revise_blocks",
      existingDraft: "SEEDED-CHAPTER-DRAFT full document",
      reviseInstruction: "Tighten the intro",
      selectedBlocks: [{ id: "b1", type: "paragraph", text: "Old intro" }],
    },
  });

  const writers = writerPrompts(captured);
  assert.ok(writers.length >= 1);
  assert.match(writers[0]!, /REVISION MODE/);
  assert.doesNotMatch(
    writers[0]!,
    /Previous draft to revise/,
    "revise mode uses existing_draft/selected blocks, not the draft slot",
  );
});
