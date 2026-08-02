/**
 * Strict, user-perspective judging helpers.
 * Caps LLM scores when required artifacts are missing so the manager
 * cannot soft-pass a draft that fails reader expectations.
 */

import { hasDrawioDiagram } from "./diagrams.js";
import type { Criterion, ManagerEvaluation, PipelineConfig } from "./types.js";

const CODE_FENCE = /```([a-zA-Z0-9_+.-]*)\n([\s\S]*?)```/g;

const DIAGRAM_LANGS = new Set(["drawio", "diagrams.net", "mxfile"]);
const OUTPUT_LANGS = new Set([
  "text",
  "output",
  "console",
  "result",
  "plain",
  "stdout",
]);

const OUTPUT_SIGNAL =
  /(?:^|\n)\s*(?:output|expected(?:\s+output)?|result|stdout|sample\s+run)\s*[:：]/im;

const EXPLAIN_NEAR_CODE =
  /(?:what this does|why this works|explanation|how it works|step[- ]by[- ]step|walkthrough)/i;

export type HeuristicReport = {
  hasDrawio: boolean;
  hasImageBrief: boolean;
  hasCodeFence: boolean;
  hasOutputSignal: boolean;
  hasCodeExplanation: boolean;
  hasAddictiveHooks: boolean;
  caps: Record<string, number>;
  notes: string[];
};

export function analyzeDraftHeuristics(draft: string): HeuristicReport {
  const text = draft || "";
  const hasDrawio = hasDrawioDiagram(text);
  const hasImageBrief =
    /!\[[^\]]*\]\([^)]+\)/.test(text) || /image-brief:/.test(text);

  let hasCodeFence = false;
  let hasOutputFence = false;

  for (const m of text.matchAll(CODE_FENCE)) {
    const lang = (m[1] || "").toLowerCase();
    if (DIAGRAM_LANGS.has(lang)) continue;
    if (OUTPUT_LANGS.has(lang)) {
      hasOutputFence = true;
      continue;
    }
    // Any other fenced block counts as code (js, python, unlabeled, etc.)
    hasCodeFence = true;
  }

  const hasOutputSignal =
    hasOutputFence ||
    OUTPUT_SIGNAL.test(text) ||
    /```(?:text|output|console|result|stdout)\n[\s\S]*?```/i.test(text);

  const hasCodeExplanation =
    hasCodeFence &&
    (EXPLAIN_NEAR_CODE.test(text) ||
      /```[\s\S]*?```[\s\S]{0,500}?(?:this |the code |running this |you (?:should|will) see)/i.test(
        text,
      ));

  const hookSignals = [
    /\?\s*$/m.test(text.slice(0, 800)),
    /\byou\b/i.test(text),
    /(?:don't miss|keep reading|here's the trick|the catch|wait|surprising|most people|secret|loop|habit)/i.test(
      text,
    ),
    (text.match(/^##\s+/gm) || []).length >= 3,
    /(?:next|try this|do this now|your turn|challenge)/i.test(text),
  ];
  const hasAddictiveHooks = hookSignals.filter(Boolean).length >= 3;

  const caps: Record<string, number> = {};
  const notes: string[] = [];

  if (!hasDrawio) {
    caps.visual_feedback = Math.min(caps.visual_feedback ?? 1, 0.45);
    notes.push("Missing fenced ```drawio diagram — visual_feedback capped.");
  }
  if (!hasImageBrief) {
    caps.visual_feedback = Math.min(caps.visual_feedback ?? 1, 0.55);
    notes.push("Missing image brief / markdown image — visual_feedback capped.");
  }
  if (!hasCodeFence) {
    caps.code_output = 0.3;
    notes.push("Missing real code fence (non-drawio) — code_output capped.");
  } else if (!hasOutputSignal) {
    caps.code_output = 0.45;
    notes.push("Code present but no shown output/result — code_output capped.");
  } else if (!hasCodeExplanation) {
    caps.code_output = 0.55;
    notes.push("Code+output without explanation — code_output capped.");
  }
  if (!hasAddictiveHooks) {
    caps.addictive = 0.5;
    notes.push(
      "Weak reader hooks / open loops / progressive payoff — addictive capped.",
    );
  }

  return {
    hasDrawio,
    hasImageBrief,
    hasCodeFence,
    hasOutputSignal,
    hasCodeExplanation,
    hasAddictiveHooks,
    caps,
    notes,
  };
}

/** Apply hard caps to manager scores; recompute passed/route. */
export function enforceStrictJudgment(
  config: PipelineConfig,
  evaluation: ManagerEvaluation,
  draft: string,
): ManagerEvaluation {
  const report = analyzeDraftHeuristics(draft);
  const scores = { ...evaluation.scores };

  for (const [id, cap] of Object.entries(report.caps)) {
    if (typeof scores[id] === "number") {
      scores[id] = Math.min(scores[id], cap);
    } else if (config.goal.criteria.some((c) => c.id === id)) {
      scores[id] = cap;
    }
  }

  for (const c of config.goal.criteria) {
    if (typeof scores[c.id] !== "number") scores[c.id] = 0;
  }

  const passed = config.goal.criteria.every((c) => scores[c.id] >= c.threshold);
  let feedback = evaluation.feedback || "";
  if (!passed && report.notes.length) {
    const extra = report.notes.join(" ");
    feedback = feedback ? `${feedback}\n${extra}` : extra;
  }

  return {
    scores,
    passed,
    route: passed ? "done" : "revise",
    feedback: passed ? "" : feedback,
    summary: passed
      ? evaluation.summary || "Draft clears the strict user-perspective bar."
      : evaluation.summary ||
        "Draft failed strict user-perspective gates — revise required.",
  };
}

export function criterionThresholdMap(
  criteria: Criterion[],
): Record<string, number> {
  return Object.fromEntries(criteria.map((c) => [c.id, c.threshold]));
}
