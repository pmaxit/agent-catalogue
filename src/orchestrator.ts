import type { CursorClient } from "./cursor-client.js";
import { buildFlowMxfile } from "./diagrams.js";
import { analyzeDraftHeuristics, enforceStrictJudgment } from "./judge.js";
import { renderTemplate } from "./template.js";
import { isOreillyChapterTheme, resolveThemePlaybook } from "./themes.js";
import type {
  AgentRunStatus,
  BriefInput,
  ManagerEvaluation,
  PipelineConfig,
  PipelineEvent,
} from "./types.js";

export type EventHandler = (event: PipelineEvent) => void | Promise<void>;

export interface RunOptions {
  brief: BriefInput;
  onEvent?: EventHandler;
  signal?: AbortSignal;
  resume?: {
    state?: Record<string, string>;
    iteration?: number;
    nodeId?: string;
  };
}

const RESEARCH_FOCUS: Record<string, string> = {
  researcher_facts: "facts, definitions, constraints, and evidence",
  researcher_examples: "worked examples, code·output pairs, pitfalls, exercises",
  researcher_visuals: "draw.io diagram specs and image briefs",
};

function buildRoster(config: PipelineConfig): Array<{
  agentId: string;
  agentName: string;
  nodeId: string;
  role: string;
}> {
  const seen = new Set<string>();
  const roster: Array<{
    agentId: string;
    agentName: string;
    nodeId: string;
    role: string;
  }> = [];
  for (const [nodeId, node] of Object.entries(config.workflow.nodes)) {
    const keys =
      node.parallel_agents && node.parallel_agents.length
        ? node.parallel_agents
        : [node.agent];
    for (const agentId of keys) {
      const dedupe = `${nodeId}:${agentId}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      const def = config.agents[agentId];
      roster.push({
        agentId,
        agentName: def?.name ?? agentId,
        nodeId,
        role: def?.description ?? nodeId,
      });
    }
  }
  return roster;
}

function parseJsonBlock(text: string): ManagerEvaluation | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as ManagerEvaluation;
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.scores || typeof parsed.route !== "string") return null;
    return {
      scores: parsed.scores,
      passed: Boolean(parsed.passed),
      route: parsed.route,
      feedback: parsed.feedback ?? "",
      summary: parsed.summary ?? "",
    };
  } catch {
    return null;
  }
}

function criteriaMet(
  config: PipelineConfig,
  evaluation: ManagerEvaluation,
): boolean {
  if (config.goal.require_all_criteria) {
    return config.goal.criteria.every((c) => {
      const score = evaluation.scores[c.id];
      return typeof score === "number" && score >= c.threshold;
    });
  }
  return evaluation.passed;
}

export class WritingOrchestrator {
  constructor(
    private readonly config: PipelineConfig,
    private readonly client: CursorClient | null,
    private readonly mock: boolean,
  ) {}

  async run(options: RunOptions): Promise<{
    status: "completed" | "max_iterations" | "error";
    draft?: string;
    evaluation?: ManagerEvaluation;
    state: Record<string, string>;
    error?: string;
  }> {
    const emit = async (event: PipelineEvent) => {
      await options.onEvent?.(event);
    };

    const theme = options.brief.theme ?? "Agentic Command";
    const format = options.brief.format ?? "long-form article";
    const themePlaybook = resolveThemePlaybook(theme, format);
    const defaultLength = isOreillyChapterTheme(theme, format)
      ? "4000–5500 words (full book chapter)"
      : "800–1200 words";

    const reviseMode = options.brief.mode === "revise_blocks";
    const selectedBlocks = options.brief.selectedBlocks ?? [];
    const selectedBlocksMarkdown = selectedBlocks.length
      ? selectedBlocks
          .map(
            (b) =>
              `<!--quill-block id="${b.id}" type="${b.type}"-->\n${b.text}\n<!--/quill-block-->`,
          )
          .join("\n\n")
      : "";

    const state: Record<string, string> = {
      brief: options.brief.brief,
      audience: options.brief.audience ?? "general readers",
      tone: options.brief.tone ?? "clear and confident",
      format,
      length: options.brief.length ?? defaultLength,
      theme,
      theme_guidance: themePlaybook.guidance,
      goal: options.brief.goal ?? "Thought Leadership",
      feedback: "",
      draft: "",
      plan: "",
      research: "",
      revise_mode: reviseMode ? "true" : "",
      existing_draft: options.brief.existingDraft ?? "",
      selected_blocks: selectedBlocksMarkdown,
      revise_instruction:
        options.brief.reviseInstruction ??
        (reviseMode ? options.brief.brief : ""),
      book_title: options.brief.bookTitle ?? "",
      chapter_title: options.brief.chapterTitle ?? "",
      chapter_number:
        options.brief.chapterNumber != null
          ? String(options.brief.chapterNumber)
          : "",
    };

    if (options.resume?.state && typeof options.resume.state === "object") {
      Object.assign(state, options.resume.state);
    }

    let iteration =
      typeof options.resume?.iteration === "number" &&
      Number.isFinite(options.resume.iteration) &&
      options.resume.iteration >= 0
        ? Math.floor(options.resume.iteration)
        : 0;
    let nodeId =
      options.resume?.nodeId && this.config.workflow.nodes[options.resume.nodeId]
        ? options.resume.nodeId
        : this.config.workflow.entry;
    let sharedAgentId: string | undefined;
    let lastEvaluation: ManagerEvaluation | undefined;

    await emit({
      type: "pipeline_started",
      workflow: this.config.workflow.name,
      brief: options.brief,
    });

    await emit({
      type: "agents_roster",
      agents: buildRoster(this.config),
    });

    // Mark full roster idle at start so the UI can paint every agent name
    for (const row of buildRoster(this.config)) {
      await emit({
        type: "agent_status",
        agentId: row.agentId,
        agentName: row.agentName,
        nodeId: row.nodeId,
        instanceId: `${row.nodeId}:${row.agentId}`,
        status: "idle",
        detail: "Waiting for turn",
      });
    }

    try {
      while (nodeId !== this.config.workflow.end) {
        if (options.signal?.aborted) {
          throw new Error("Pipeline aborted");
        }

        const node = this.config.workflow.nodes[nodeId];
        if (!node) throw new Error(`Unknown workflow node: ${nodeId}`);

        const primaryDef = this.config.agents[node.agent];
        if (!primaryDef) throw new Error(`Unknown agent: ${node.agent}`);

        const parallelKeys =
          node.parallel_agents && node.parallel_agents.length > 0
            ? node.parallel_agents
            : null;

        await emit({
          type: "node_started",
          nodeId,
          agentId: node.agent,
          agentName: primaryDef.name,
          iteration,
        });

        let evaluation: ManagerEvaluation | undefined;
        let output = "";

        if (parallelKeys) {
          const merged = await this.runParallelAgents({
            nodeId,
            agentKeys: parallelKeys,
            state,
            iteration,
            emit,
            signal: options.signal,
          });
          output = merged;
          state[primaryDef.output_key] = merged;
          if (primaryDef.output_key === "research" || nodeId === "research") {
            state.research = merged;
          }
        } else {
          const result = await this.runSingleAgent({
            nodeId,
            agentKey: node.agent,
            state,
            iteration,
            sharedAgentId,
            emit,
          });
          if (this.config.defaults.session === "shared") {
            sharedAgentId = result.cursorAgentId;
          }
          evaluation = result.evaluation;
          output = result.output;
          state[primaryDef.output_key] = output;
          if (primaryDef.output_key === "draft") state.draft = result.rawText;
          if (evaluation?.feedback) state.feedback = evaluation.feedback;
          if (evaluation) lastEvaluation = evaluation;
        }

        await emit({
          type: "node_finished",
          nodeId,
          agentId: node.agent,
          agentName: primaryDef.name,
          outputKey: primaryDef.output_key,
          output,
          evaluation,
        });

        let next: string | undefined;
        let reason = "next";

        if (node.routes && evaluation) {
          next = node.routes[evaluation.route];
          reason = `manager:${evaluation.route}`;
          if (!next) {
            throw new Error(
              `No route mapped for manager route "${evaluation.route}"`,
            );
          }
          if (node.counts_as_iteration && evaluation.route === "revise") {
            iteration += 1;
            if (iteration >= this.config.goal.max_iterations) {
              await emit({
                type: "route",
                from: nodeId,
                to: this.config.workflow.end,
                reason: "max_iterations",
                iteration,
              });
              const result = {
                status: "max_iterations" as const,
                draft: state.draft,
                evaluation: lastEvaluation,
                state,
              };
              await emit({ type: "pipeline_finished", ...result });
              return result;
            }
          }
          if (evaluation.route === "done") {
            next = this.config.workflow.end;
          }
        } else {
          next = node.next;
        }

        if (!next) {
          throw new Error(`Node ${nodeId} has no next/routes target`);
        }

        await emit({
          type: "route",
          from: nodeId,
          to: next,
          reason,
          iteration,
        });
        nodeId = next;
      }

      const result = {
        status: "completed" as const,
        draft: state.draft,
        evaluation: lastEvaluation,
        state,
      };
      await emit({ type: "pipeline_finished", ...result });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const result = {
        status: "error" as const,
        draft: state.draft || undefined,
        evaluation: lastEvaluation,
        state,
        error: message,
      };
      await emit({ type: "pipeline_finished", ...result });
      return result;
    }
  }

  private async emitStatus(
    emit: EventHandler,
    args: {
      agentId: string;
      agentName: string;
      nodeId: string;
      instanceId: string;
      status: AgentRunStatus;
      detail?: string;
    },
  ): Promise<void> {
    await emit({ type: "agent_status", ...args });
  }

  private async runParallelAgents(args: {
    nodeId: string;
    agentKeys: string[];
    state: Record<string, string>;
    iteration: number;
    emit: EventHandler;
    signal?: AbortSignal;
  }): Promise<string> {
    const { nodeId, agentKeys, state, iteration, emit, signal } = args;

    for (const agentKey of agentKeys) {
      const def = this.config.agents[agentKey];
      if (!def) throw new Error(`Unknown parallel agent: ${agentKey}`);
      await this.emitStatus(emit, {
        agentId: agentKey,
        agentName: def.name,
        nodeId,
        instanceId: `${nodeId}:${agentKey}`,
        status: "queued",
        detail: "Queued for parallel fan-out",
      });
    }

    const settled = await Promise.all(
      agentKeys.map(async (agentKey) => {
        if (signal?.aborted) throw new Error("Pipeline aborted");
        const def = this.config.agents[agentKey]!;
        const instanceId = `${nodeId}:${agentKey}`;
        await this.emitStatus(emit, {
          agentId: agentKey,
          agentName: def.name,
          nodeId,
          instanceId,
          status: "running",
          detail: "Spawned",
        });

        const prompt = renderTemplate(def.instruction, {
          ...state,
          research_focus: RESEARCH_FOCUS[agentKey] ?? def.description ?? agentKey,
          criteria: this.config.goal.criteria,
          iteration,
          max_iterations: this.config.goal.max_iterations,
        });

        const model = def.model ?? this.config.defaults.model;
        const mode = def.mode ?? this.config.defaults.mode;

        try {
          const { text, cursorAgentId, cursorRunId, url } =
            await this.invokeAgent({
              agentKey,
              displayName: `${def.name} · ${nodeId}`,
              prompt,
              model,
              mode,
              // Parallel agents always get isolated sessions
              sharedAgentId: undefined,
              onDelta: async (delta) => {
                await this.emitStatus(emit, {
                  agentId: agentKey,
                  agentName: def.name,
                  nodeId,
                  instanceId,
                  status: "streaming",
                  detail: String(delta).slice(0, 80),
                });
                await emit({
                  type: "assistant_delta",
                  nodeId,
                  agentId: agentKey,
                  agentName: def.name,
                  text: delta,
                });
              },
              onStatus: async (status) => {
                await emit({
                  type: "status",
                  nodeId,
                  agentId: agentKey,
                  agentName: def.name,
                  status,
                });
              },
            });

          await emit({
            type: "agent_created",
            nodeId,
            agentId: agentKey,
            agentName: def.name,
            cursorAgentId,
            cursorRunId,
            url,
          });

          await this.emitStatus(emit, {
            agentId: agentKey,
            agentName: def.name,
            nodeId,
            instanceId,
            status: "done",
            detail: "Completed",
          });

          return {
            agentKey,
            name: def.name,
            outputKey: def.output_key,
            text,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await this.emitStatus(emit, {
            agentId: agentKey,
            agentName: def.name,
            nodeId,
            instanceId,
            status: "error",
            detail: message,
          });
          throw err;
        }
      }),
    );

    // Join — wait for all before advancing (Promise.all already enforces this)
    const sections = settled.map(
      (s) => `## ${s.name}\n\n${s.text.trim()}`,
    );
    for (const s of settled) {
      state[s.outputKey] = s.text;
    }
    return `# Parallel research join\n\n${sections.join("\n\n")}\n`;
  }

  private async runSingleAgent(args: {
    nodeId: string;
    agentKey: string;
    state: Record<string, string>;
    iteration: number;
    sharedAgentId?: string;
    emit: EventHandler;
  }): Promise<{
    output: string;
    rawText: string;
    evaluation?: ManagerEvaluation;
    cursorAgentId: string;
  }> {
    const { nodeId, agentKey, state, iteration, sharedAgentId, emit } = args;
    const agentDef = this.config.agents[agentKey]!;
    const instanceId = `${nodeId}:${agentKey}:${iteration}`;

    await this.emitStatus(emit, {
      agentId: agentKey,
      agentName: agentDef.name,
      nodeId,
      instanceId,
      status: "queued",
      detail: "Queued",
    });
    await this.emitStatus(emit, {
      agentId: agentKey,
      agentName: agentDef.name,
      nodeId,
      instanceId,
      status: "running",
      detail: "Spawned",
    });

    const prompt = renderTemplate(agentDef.instruction, {
      ...state,
      research_focus: RESEARCH_FOCUS[agentKey] ?? "",
      criteria: this.config.goal.criteria,
      iteration,
      max_iterations: this.config.goal.max_iterations,
    });

    const model = agentDef.model ?? this.config.defaults.model;
    const mode = agentDef.mode ?? this.config.defaults.mode;

    const { text, cursorAgentId, cursorRunId, url } = await this.invokeAgent({
      agentKey,
      displayName: `${agentDef.name} · ${nodeId}`,
      prompt,
      model,
      mode,
      sharedAgentId,
      onDelta: async (delta) => {
        await this.emitStatus(emit, {
          agentId: agentKey,
          agentName: agentDef.name,
          nodeId,
          instanceId,
          status: "streaming",
          detail: String(delta).slice(0, 80),
        });
        await emit({
          type: "assistant_delta",
          nodeId,
          agentId: agentKey,
          agentName: agentDef.name,
          text: delta,
        });
      },
      onStatus: async (status) => {
        await emit({
          type: "status",
          nodeId,
          agentId: agentKey,
          agentName: agentDef.name,
          status,
        });
      },
    });

    await emit({
      type: "agent_created",
      nodeId,
      agentId: agentKey,
      agentName: agentDef.name,
      cursorAgentId,
      cursorRunId,
      url,
    });

    let evaluation: ManagerEvaluation | undefined;
    let output = text;

    if (agentDef.response_format === "json") {
      evaluation = parseJsonBlock(text) ?? {
        scores: Object.fromEntries(
          this.config.goal.criteria.map((c) => [c.id, 0]),
        ),
        passed: false,
        route: "revise",
        feedback:
          "Manager returned unparseable JSON. Revise for clarity; add code+output+explanation, draw.io diagram, and a stronger hook.",
        summary: "Parse failure — forcing revise",
      };
      evaluation = enforceStrictJudgment(
        this.config,
        evaluation,
        state.draft || "",
        { skipArtifactCaps: Boolean(state.revise_mode) },
      );
      if (
        evaluation.route === "done" &&
        !criteriaMet(this.config, evaluation)
      ) {
        evaluation.route = "revise";
        evaluation.passed = false;
        evaluation.feedback =
          evaluation.feedback ||
          "Scores below threshold — continue revising.";
      }
      output = JSON.stringify(evaluation, null, 2);
    }

    await this.emitStatus(emit, {
      agentId: agentKey,
      agentName: agentDef.name,
      nodeId,
      instanceId,
      status: "done",
      detail: evaluation ? `route=${evaluation.route}` : "Completed",
    });

    return { output, rawText: text, evaluation, cursorAgentId };
  }

  private async invokeAgent(args: {
    agentKey: string;
    displayName: string;
    prompt: string;
    model: { id: string; params?: Array<{ id: string; value: string }> };
    mode: "agent" | "plan";
    sharedAgentId?: string;
    onDelta: (text: string) => Promise<void>;
    onStatus: (status: string) => Promise<void>;
  }): Promise<{
    text: string;
    cursorAgentId: string;
    cursorRunId: string;
    url?: string;
  }> {
    if (this.mock || !this.client) {
      return this.mockInvoke(args);
    }

    const client = this.client;
    let agentId = args.sharedAgentId;
    let runId: string;
    let url: string | undefined;

    if (agentId && this.config.defaults.session === "shared") {
      const created = await client.createRun(agentId, args.prompt, args.mode);
      runId = created.run.id;
    } else {
      const created = await client.createAgent({
        prompt: { text: args.prompt },
        model: args.model,
        name: args.displayName.slice(0, 100),
        mode: args.mode,
        // no_repo: omit repos and env
      });
      agentId = created.agent.id;
      runId = created.run.id;
      url = created.agent.url;
    }

    try {
      const streamed = await client.streamRun(agentId, runId, async (ev) => {
        if (ev.type === "assistant" && typeof ev.data.text === "string") {
          await args.onDelta(ev.data.text);
        }
        if (ev.type === "status" && typeof ev.data.status === "string") {
          await args.onStatus(ev.data.status);
        }
      });
      if (streamed.status === "ERROR") {
        throw new Error(`Cursor run ${runId} failed`);
      }
      return {
        text: streamed.text,
        cursorAgentId: agentId,
        cursorRunId: runId,
        url,
      };
    } catch {
      const run = await client.waitForRun(agentId, runId, {
        pollIntervalMs: this.config.api.poll_interval_ms,
        timeoutMs: this.config.api.run_timeout_ms,
        onStatus: (s) => {
          void args.onStatus(s);
        },
      });
      if (run.status !== "FINISHED") {
        throw new Error(`Cursor run ${runId} ended with ${run.status}`);
      }
      return {
        text: run.result ?? "",
        cursorAgentId: agentId,
        cursorRunId: runId,
        url,
      };
    }
  }

  private async mockInvoke(args: {
    agentKey: string;
    displayName: string;
    prompt: string;
    onDelta: (text: string) => Promise<void>;
  }): Promise<{
    text: string;
    cursorAgentId: string;
    cursorRunId: string;
    url?: string;
  }> {
    const text = mockResponse(args.agentKey, args.prompt);
    // Simulate streaming chunks
    const chunk = Math.max(24, Math.floor(text.length / 8));
    for (let i = 0; i < text.length; i += chunk) {
      await args.onDelta(text.slice(i, i + chunk));
      await new Promise((r) => setTimeout(r, 40));
    }
    return {
      text,
      cursorAgentId: `mock-agent-${args.agentKey}`,
      cursorRunId: `mock-run-${Date.now()}`,
      url: undefined,
    };
  }
}

function mockOreillyChapter(brief: string, feedback?: string): string {
  const mx = buildFlowMxfile("Chapter learning loop", [
    "Warm-up problem",
    "Core concept",
    "Hands-on lab",
    "Read the output",
    "Pitfall check",
    "Exercise",
  ], [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 3, to: 5 },
  ]);

  return `# Chapter 4: ${brief}

![Annotated lab session](image-brief:oreilly-lab-session "Place after What You Will Learn")

You ship a change that "looks right," then spend an hour wondering why production disagrees.
This chapter treats ${brief} the O'Reilly way: a warm-up failure, crisp concepts, typed labs with real output, and exercises you can finish tonight.

## A Warm-Up Problem

Imagine you paste a "working" snippet from a blog, run it, and get silence — or worse, the wrong kind of success.
The itch is not missing syntax; it is a missing mental model of how the pieces talk to each other.

> **Note:** If you already have a failing case from your own stack, keep it open beside this chapter. We will map each section onto that failure.

## What You Will Build / Learn

By the end of this chapter you will be able to:

- State the core idea behind ${brief} in one plain sentence
- Run a minimal lab and predict the output before it prints
- Spot the three pitfalls that burn first-week practitioners
- Complete a longer practice path that ties the labs together

## Core Concepts

Before we type, name the parts. ${brief} is easiest when you separate:

1. **Intent** — what outcome you want the system to produce
2. **Contract** — inputs, outputs, and failure modes you can observe
3. **Feedback** — how you know the contract held (logs, return values, diagrams)

> **Tip:** Write the contract in a comment before the first function. If you cannot write it, you are not ready to code yet.

## Hands-On: Walkthrough

### Listing 1 — the failing gate

\`\`\`javascript
function clearsBar(scores, thresholds) {
  return Object.keys(thresholds).every(
    (id) => Number(scores[id] ?? 0) >= thresholds[id]
  );
}

console.log(
  clearsBar(
    { correctness: 0.9, clarity: 0.7 },
    { correctness: 0.85, clarity: 0.85, helpfulness: 0.85 }
  )
);
\`\`\`

Output:

\`\`\`text
false
\`\`\`

Explanation: \`helpfulness\` is missing from scores, so it becomes \`0\` and fails the floor. Soft drafts fail for the same reason — absent evidence counts as zero.

### Listing 2 — the repaired path

\`\`\`javascript
function clearsBar(scores, thresholds) {
  return Object.entries(thresholds).every(
    ([id, min]) => Number(scores[id] ?? 0) >= min
  );
}

const thresholds = {
  correctness: 0.85,
  clarity: 0.85,
  helpfulness: 0.85,
  code_output: 0.85,
  visual_feedback: 0.85,
  addictive: 0.8,
};

const scores = {
  correctness: 0.9,
  clarity: 0.88,
  helpfulness: 0.9,
  code_output: 0.9,
  visual_feedback: 0.9,
  addictive: 0.85,
};

console.log(clearsBar(scores, thresholds));
\`\`\`

Output:

\`\`\`text
true
\`\`\`

Explanation: every criterion is present and above its floor. That is the chapter's posture for ${brief}: prove each leg, then move on.

## How It Fits Together

The chapter loop is not "read then vibe." It is problem → concept → lab → output literacy → pitfall → exercise:

\`\`\`drawio
${mx}
\`\`\`

Keep this diagram next to your terminal. If a step cannot point to a node, you skipped a beat.

## Common Pitfalls

> **Warning:** Do not celebrate green output you cannot explain. Unexplained success is tomorrow's outage.

- **Tutorial theater** — copying listings without predicting output first
- **One-listing chapters** — a single happy path hides the failure modes
- **Diagram decoration** — a pretty graph that does not match the code path
- **Skipping exercises** — reading without reps does not build judgment

## Putting It Into Practice

Take ${brief} through a longer path:

1. Restate the warm-up failure in one paragraph
2. Write the contract (inputs / outputs / failure modes)
3. Run Listing 1 style until you can force \`false\` on purpose
4. Repair toward Listing 2 until \`true\` is boringly repeatable
5. Sketch the draw.io loop for *your* system, not the sample's

When the practice path feels slow, that is the point — chapters earn trust by making you do the work.

## Exercises

1. **Reproduce:** Create a minimal case where ${brief} fails for an obvious, documented reason. Paste the output.
2. **Extend:** Add one new threshold or check to Listing 2. Predict the output, then run it.
3. **Teach-back:** Explain the diagram to a colleague without showing the code. If they cannot redraw the edges, simplify the nodes.
4. **Stretch:** Write a Tip and a Warning callout for your team's real stack based on this chapter.

## Summary

- Start from a warm-up failure, not a definition dump
- Teach ${brief} with contracts, labs, and output literacy
- Require code + shown output + explanation as a single unit
- Use diagrams to show the system, Tip/Note/Warning to steer judgment
- Close with exercises so the chapter becomes skill, not souvenir

Next: take the repaired path into an integration chapter — wire ${brief} into a multi-step workflow and keep the same hard gate.

${feedback ? `<!-- addressed feedback: ${feedback.slice(0, 200)} -->` : ""}
`;
}

function mockResponse(agentKey: string, prompt: string): string {
  const briefMatch = prompt.match(/Brief:\n([\s\S]*?)(?:\n\n[A-Z]|\nAudience:)/);
  const brief = (briefMatch?.[1] ?? "the requested topic").trim().slice(0, 120);
  const oreilly =
    /o'?reilly|book chapter|THEME PERSONALITY — O'Reilly|full book chapter/i.test(
      prompt,
    );

  if (agentKey === "planner") {
    if (oreilly) {
      return `# Chapter plan for: ${brief}

## Title options
1. Chapter 4: ${brief} — Learning by Doing
2. ${brief}: From First Principles to Working Code
3. Making ${brief} Stick

## Audience insight
Practitioners who have skimmed blog posts and still cannot ship a working mental model.
They fear wasted weekends; they want labs they can type along with.

## Outline (full O'Reilly chapter)
1. Warm-Up Problem — a concrete failure that motivates the chapter
2. What You Will Build / Learn — outcomes checklist
3. Core Concepts — precise definitions
4. Hands-On Walkthrough — multiple code + output + explanation beats
5. How It Fits Together — architecture/workflow diagram
6. Common Pitfalls — Warning callouts
7. Putting It Into Practice — longer worked example
8. Exercises — 3 practice prompts
9. Summary — recap + next chapter hook

## Research questions
- What durable facts vs opinions belong in this chapter?
- Which two labs prove the concept beyond a toy snippet?
- What pitfalls do practitioners hit in the first week?

## Code · output · explanation beats
- Listing 1: minimal failing example + output + why it fails
- Listing 2: corrected path + output + explanation
- Listing 3: integration check in the longer worked example

## Visual feedback
- draw.io: concept → practice → judgment loop (after Core Concepts)
- Image brief: annotated terminal/session still (near Hands-On)

## Addictive devices
- Open with a broken system the reader recognizes
- Pay off each open loop in Hands-On
- Close with exercises that create urge to try tonight
`;
    }
    return `# Plan for: ${brief}

## Title options
1. ${brief}: A Practical Guide
2. Understanding ${brief}
3. How to Think About ${brief}

## Audience insight
Readers want clarity, credible framing, and something they can use today.

## Outline
1. Hook & stakes
2. Core concepts
3. Practical playbook
4. Common pitfalls
5. Closing takeaway

## Research questions
- What are the durable facts vs. opinions?
- What examples make this concrete?
- Where do beginners get stuck?

## Image opportunities
- Hero diagram of the main framework
- Before/after comparison visual

## Required draw.io diagrams
- Pipeline workflow: Plan → Research → Write → Judge (place after intro)
- Quality gate decision: revise vs done (place near judge section)
`;
  }

  if (agentKey === "researcher" || agentKey.startsWith("researcher_")) {
    const focus =
      agentKey === "researcher_examples"
        ? "examples"
        : agentKey === "researcher_visuals"
          ? "visuals"
          : "facts";
    if (focus === "examples") {
      return `# Examples research

## Worked example ideas
- Minimal failing case that motivates the chapter
- Corrected lab with predicted output

## Code · output pairs
- Listing that fails for an obvious reason + sample output
- Repaired listing + success output

## Common pitfalls
- Tutorial theater without predicting output
- Shipping code without explanation

## Exercise prompts
1. Reproduce the warm-up failure
2. Extend the repaired lab with one new constraint
`;
    }
    if (focus === "visuals") {
      return `# Visuals research

## Image research notes
- Style: clean line art, parchment-adjacent neutrals for book chapters
- Depict warm-up failure vs repaired flow

## Diagram specs (draw.io)
- Nodes: Problem, Concept, Lab, Output, Pitfall, Exercise
- Edges: Problem→Concept→Lab→Output; Output→Pitfall; Output→Exercise

## Suggested figure captions
- "Chapter learning loop from warm-up to exercise"
`;
    }
    if (oreilly) {
      return `# Facts research (book chapter)

## Key findings
- ${brief} is best taught as concept → tiny lab → output literacy → pitfall.
- Tip/Note/Warning callouts reduce support load without bloating prose.

## Evidence / rationale
- Example-first chapters outperform theory-first for practitioners.
- Exercises with a 20–40 minute scope convert reading into skill.

## Open questions
- Exact product versions drift — keep examples version-tolerant.

## Suggested source types
- Primary docs, RFCs, reputable engineering blogs
`;
    }
    return `# Research notes

## Key findings
- The topic centers on clear definitions and staged practice.
- Readers benefit from concrete examples over abstract claims.
- Visual structure improves retention for procedural content.

## Evidence / rationale
- Structured outlines reduce cognitive load for long-form reading.
- Image briefs help designers and writers align early.
- Workflow diagrams (draw.io) make multi-step systems scannable.

## Open questions
- Exact metrics depend on the reader's vertical — keep ranges cautious.

## Suggested source types
- Primary docs, reputable industry reports, first-party experiments
`;
  }

  if (agentKey === "writer") {
    const feedback = /Manager feedback[\s\S]*?:\n([\s\S]*?)(?:\n\n|$)/i.exec(
      prompt,
    )?.[1];
    if (/REVISION MODE|Selected blocks \(preserve|Selected blocks to revise/i.test(prompt)) {
      const section =
        /Selected blocks[^\n]*:\n([\s\S]*?)(?:\n\n[A-Z][^\n]*:|\n\nRequirements|\n\nOutput ONLY|$)/i.exec(
          prompt,
        )?.[1] ?? "";
      const blockRe =
        /<!--\s*quill-block\s+id=["']([^"']+)["']\s*(?:type=["']([^"']*)["'])?\s*-->([\s\S]*?)<!--\s*\/quill-block\s*-->/gi;
      const parts: string[] = [];
      let bm: RegExpExecArray | null;
      const source = section || prompt;
      while ((bm = blockRe.exec(source)) !== null) {
        const id = bm[1];
        if (id === "THE_SAME_ID") continue;
        const type = bm[2] || "paragraph";
        const text = bm[3].trim();
        parts.push(
          `<!--quill-block id="${id}" type="${type}"-->\n${text}\n\n*(Revised for clarity and stronger practical guidance.)*\n<!--/quill-block-->`,
        );
      }
      if (parts.length) {
        return `${parts.join("\n\n")}${feedback ? `\n<!-- addressed feedback: ${feedback.slice(0, 120)} -->` : ""}`;
      }
    }
    if (oreilly) {
      return mockOreillyChapter(brief, feedback);
    }
    const mx = buildFlowMxfile("Writing pipeline", [
      "Plan",
      "Research",
      "Write",
      "Judge",
    ], [
      { from: 0, to: 1 },
      { from: 1, to: 2 },
      { from: 2, to: 3 },
      { from: 3, to: 2, label: "revise" },
    ]);
    return `# ${brief}

![Framework overview](image-brief:plan-research-write-loop "Place after intro")

What if your writing system refused to soft-exit?

${brief} rewards a disciplined loop: plan what matters, research what is true, and write what helps — then prove it with code, output, and a diagram the reader can feel.

\`\`\`drawio
${mx}
\`\`\`

## Why this matters
Readers do not need more noise. They need a path from confusion to a usable next step — and a reason to keep scrolling.

## Try this snippet
Here is a tiny quality gate you can run mentally (or in a REPL) whenever a draft claims it is "done":

\`\`\`javascript
function clearsBar(scores, thresholds) {
  return Object.entries(thresholds).every(
    ([id, min]) => Number(scores[id] ?? 0) >= min
  );
}

const thresholds = {
  correctness: 0.85,
  clarity: 0.85,
  helpfulness: 0.85,
  code_output: 0.85,
  visual_feedback: 0.85,
  addictive: 0.8,
};

console.log(
  clearsBar(
    { correctness: 0.9, clarity: 0.88, helpfulness: 0.9, code_output: 0.9, visual_feedback: 0.9, addictive: 0.85 },
    thresholds
  )
);
\`\`\`

Output:

\`\`\`text
true
\`\`\`

Explanation: every criterion must clear its floor. If any score is missing or soft, \`clearsBar\` returns false — the same posture as Quill's manager: revise by default.

## The playbook
1. **Plan** — name the audience, outline the sections, list research questions, and plant open loops.
2. **Research** — gather durable facts; mark uncertainty honestly.
3. **Write** — turn the plan into scannable prose with code, output, explanation, and visual feedback.
4. **Judge** — score correctness, clarity, helpfulness, code_output, visual_feedback, and addictive pull; revise until the bar is met.

## Pitfalls
- Inventing citations
- Shipping prose without code+output+explanation
- Skipping draw.io workflow graphs or image briefs
- Writing before the questions are clear
- Flat tone with no hook or challenge

## Your turn
Run one draft through a hard gate today. If any criterion fails, revise — do not publish on vibes.
${feedback ? `\n<!-- addressed feedback: ${feedback.slice(0, 200)} -->` : ""}
`;
  }

  if (agentKey === "manager") {
    const draftMatch = prompt.match(/Draft:\n([\s\S]*?)(?:\n\nIteration:|$)/);
    const draft = draftMatch?.[1] ?? prompt;
    const report = analyzeDraftHeuristics(draft);
    const draftSection = prompt.includes("Draft:");
    const revisePass =
      /REVISION MODE|selective block/i.test(prompt) &&
      /<!--\s*quill-block\s+id=/i.test(draft);
    if (revisePass) {
      return JSON.stringify(
        {
          scores: {
            correctness: 0.9,
            clarity: 0.9,
            helpfulness: 0.9,
            code_output: 0.9,
            visual_feedback: 0.9,
            addictive: 0.85,
          },
          passed: true,
          route: "done",
          feedback: "",
          summary: "Selective block revisions look solid.",
        },
        null,
        2,
      );
    }
    const chapterOk =
      !oreilly ||
      (/##\s+(A Warm-Up|What You Will|Exercises|Summary)/i.test(draft) &&
        draft.split(/\s+/).length >= 800);
    const scores = {
      correctness: draftSection && chapterOk ? 0.9 : oreilly && !chapterOk ? 0.55 : draftSection ? 0.9 : 0.4,
      clarity: draftSection ? 0.88 : 0.4,
      helpfulness: draftSection && chapterOk ? 0.88 : oreilly && !chapterOk ? 0.5 : draftSection ? 0.88 : 0.4,
      code_output:
        report.hasCodeFence && report.hasOutputSignal && report.hasCodeExplanation
          ? 0.9
          : 0.35,
      visual_feedback:
        report.hasDrawio && report.hasImageBrief ? 0.9 : 0.4,
      addictive: report.hasAddictiveHooks ? 0.86 : 0.45,
    };
    const thresholds: Record<string, number> = {
      correctness: 0.85,
      clarity: 0.85,
      helpfulness: 0.85,
      code_output: 0.85,
      visual_feedback: 0.85,
      addictive: 0.8,
    };
    const passed = Object.entries(scores).every(
      ([k, s]) => s >= (thresholds[k] ?? 0.85),
    );
    return JSON.stringify(
      {
        scores,
        passed,
        route: passed ? "done" : "revise",
        feedback: passed
          ? ""
          : [
              !report.hasCodeFence || !report.hasOutputSignal || !report.hasCodeExplanation
                ? "Add a real code fence, show sample output, and explain it."
                : "",
              !report.hasDrawio || !report.hasImageBrief
                ? "Add ```drawio mxfile visual feedback AND an image brief."
                : "",
              !report.hasAddictiveHooks
                ? "Strengthen the hook, open loops, and closing challenge (addictive)."
                : "",
              "Tighten correctness and clarity from the reader's seat.",
            ]
              .filter(Boolean)
              .join(" "),
        summary: passed
          ? "Draft clears the strict user-perspective bar."
          : "Draft failed strict gates — revise required.",
      },
      null,
      2,
    );
  }

  return `Mock output for ${agentKey}`;
}
