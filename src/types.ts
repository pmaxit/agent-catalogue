import { z } from "zod";

const ModelSchema = z.object({
  id: z.string().min(1),
  params: z
    .array(z.object({ id: z.string(), value: z.string() }))
    .optional(),
});

const CriterionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().positive().default(1),
  threshold: z.number().min(0).max(1),
});

const AgentDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  model: ModelSchema.optional(),
  mode: z.enum(["agent", "plan"]).optional(),
  output_key: z.string().min(1),
  instruction: z.string().min(1),
  response_format: z.enum(["text", "json"]).optional().default("text"),
  mcp_servers: z.array(z.record(z.unknown())).optional(),
});

const WorkflowNodeSchema = z.object({
  agent: z.string().min(1),
  next: z.string().optional(),
  routes: z.record(z.string()).optional(),
  counts_as_iteration: z.boolean().optional().default(false),
});

export const PipelineConfigSchema = z.object({
  api: z.object({
    base_url: z.string().url(),
    key_env: z.string().min(1),
    auth: z.enum(["basic", "bearer"]).default("basic"),
    mock: z.union([z.boolean(), z.string()]).optional(),
    poll_interval_ms: z.number().int().positive().default(2000),
    request_timeout_ms: z.number().int().positive().default(120000),
    run_timeout_ms: z.number().int().positive().default(600000),
  }),
  defaults: z.object({
    model: ModelSchema,
    runtime: z.enum(["no_repo", "cloud", "local"]).default("no_repo"),
    session: z.enum(["shared", "per_step"]).default("per_step"),
    mode: z.enum(["agent", "plan"]).default("agent"),
  }),
  app: z.object({
    title: z.string(),
    tagline: z.string().optional(),
    port: z.union([z.number(), z.string()]),
    public_dir: z.string().default("public"),
  }),
  goal: z.object({
    name: z.string(),
    max_iterations: z.number().int().positive().default(5),
    require_all_criteria: z.boolean().default(true),
    criteria: z.array(CriterionSchema).min(1),
  }),
  agents: z.record(AgentDefSchema),
  workflow: z.object({
    name: z.string(),
    entry: z.string(),
    end: z.string().default("end"),
    nodes: z.record(WorkflowNodeSchema),
  }),
});

export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type AgentDef = z.infer<typeof AgentDefSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type WorkflowNode = z.infer<typeof WorkflowNodeSchema>;

export interface BriefInput {
  brief: string;
  audience?: string;
  tone?: string;
  format?: string;
  length?: string;
  theme?: string;
  goal?: string;
}

export interface ManagerEvaluation {
  scores: Record<string, number>;
  passed: boolean;
  route: "revise" | "done" | string;
  feedback: string;
  summary: string;
}

export type PipelineEvent =
  | { type: "pipeline_started"; workflow: string; brief: BriefInput }
  | { type: "node_started"; nodeId: string; agentId: string; iteration: number }
  | {
      type: "agent_created";
      nodeId: string;
      cursorAgentId: string;
      cursorRunId: string;
      url?: string;
    }
  | { type: "assistant_delta"; nodeId: string; text: string }
  | { type: "status"; nodeId: string; status: string }
  | {
      type: "node_finished";
      nodeId: string;
      agentId: string;
      outputKey: string;
      output: string;
      evaluation?: ManagerEvaluation;
    }
  | {
      type: "route";
      from: string;
      to: string;
      reason: string;
      iteration: number;
    }
  | {
      type: "pipeline_finished";
      status: "completed" | "max_iterations" | "error";
      draft?: string;
      evaluation?: ManagerEvaluation;
      state: Record<string, string>;
      error?: string;
    };
