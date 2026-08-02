import type { CursorClient } from "./cursor-client.js";
import { buildFlowMxfile } from "./diagrams.js";
import { analyzeDraftHeuristics, enforceStrictJudgment } from "./judge.js";
import { renderTemplate } from "./template.js";
import type {
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

    const state: Record<string, string> = {
      brief: options.brief.brief,
      audience: options.brief.audience ?? "general readers",
      tone: options.brief.tone ?? "clear and confident",
      format: options.brief.format ?? "long-form article",
      length: options.brief.length ?? "800–1200 words",
      theme: options.brief.theme ?? "Atelier Editorial",
      goal: options.brief.goal ?? "Thought Leadership",
      feedback: "",
      draft: "",
      plan: "",
      research: "",
    };

    let iteration = 0;
    let nodeId = this.config.workflow.entry;
    let sharedAgentId: string | undefined;
    let lastEvaluation: ManagerEvaluation | undefined;

    await emit({
      type: "pipeline_started",
      workflow: this.config.workflow.name,
      brief: options.brief,
    });

    try {
      while (nodeId !== this.config.workflow.end) {
        if (options.signal?.aborted) {
          throw new Error("Pipeline aborted");
        }

        const node = this.config.workflow.nodes[nodeId];
        if (!node) throw new Error(`Unknown workflow node: ${nodeId}`);

        const agentDef = this.config.agents[node.agent];
        if (!agentDef) throw new Error(`Unknown agent: ${node.agent}`);

        await emit({
          type: "node_started",
          nodeId,
          agentId: node.agent,
          iteration,
        });

        const prompt = renderTemplate(agentDef.instruction, {
          ...state,
          criteria: this.config.goal.criteria,
          iteration,
          max_iterations: this.config.goal.max_iterations,
        });

        const model = agentDef.model ?? this.config.defaults.model;
        const mode = agentDef.mode ?? this.config.defaults.mode;

        const { text, cursorAgentId, cursorRunId, url } = await this.invokeAgent({
          agentKey: node.agent,
          displayName: `${agentDef.name} · ${nodeId}`,
          prompt,
          model,
          mode,
          sharedAgentId,
          onDelta: async (delta) => {
            await emit({ type: "assistant_delta", nodeId, text: delta });
          },
          onStatus: async (status) => {
            await emit({ type: "status", nodeId, status });
          },
        });

        if (this.config.defaults.session === "shared") {
          sharedAgentId = cursorAgentId;
        }

        await emit({
          type: "agent_created",
          nodeId,
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
          // Strict user-perspective enforcement: hard-cap soft LLM scores
          evaluation = enforceStrictJudgment(
            this.config,
            evaluation,
            state.draft || "",
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
          lastEvaluation = evaluation;
          output = JSON.stringify(evaluation, null, 2);
        }

        state[agentDef.output_key] = output;
        if (agentDef.output_key === "draft") state.draft = text;
        if (evaluation?.feedback) state.feedback = evaluation.feedback;

        await emit({
          type: "node_finished",
          nodeId,
          agentId: node.agent,
          outputKey: agentDef.output_key,
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

function mockResponse(agentKey: string, prompt: string): string {
  const briefMatch = prompt.match(/Brief:\n([\s\S]*?)(?:\n\n[A-Z]|\nAudience:)/);
  const brief = (briefMatch?.[1] ?? "the requested topic").trim().slice(0, 120);

  if (agentKey === "planner") {
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

  if (agentKey === "researcher") {
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

## Image research notes
- Style: editorial line illustration, muted ink on warm paper
- Depict the 3-step loop: plan → research → write

## Diagram specs (draw.io)
- Nodes: Plan, Research, Write, Judge
- Edges: sequential arrows; Judge → Write labeled "revise"; Judge → Done labeled "publish"
`;
  }

  if (agentKey === "writer") {
    const feedback = /Manager feedback[\s\S]*?:\n([\s\S]*?)(?:\n\n|$)/i.exec(
      prompt,
    )?.[1];
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
    const scores = {
      correctness: draftSection ? 0.9 : 0.4,
      clarity: draftSection ? 0.88 : 0.4,
      helpfulness: draftSection ? 0.88 : 0.4,
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
