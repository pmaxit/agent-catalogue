import assert from "node:assert/strict";
import test from "node:test";
import { PipelineConfigSchema } from "../src/types.js";

test("PipelineConfigSchema coerces numeric strings in config", () => {
  const parsed = PipelineConfigSchema.parse({
    api: {
      base_url: "https://api.cursor.com",
      key_env: "CURSOR_API_KEY",
      auth: "basic",
      mock: "false",
      poll_interval_ms: "2000",
      request_timeout_ms: "120000",
      run_timeout_ms: "600000",
      suggest_model: "composer-2.5-fast",
      suggest_timeout_ms: "30000",
    },
    defaults: {
      model: { id: "composer-2.5" },
      runtime: "no_repo",
      session: "per_step",
      mode: "agent",
    },
    app: {
      title: "Quill",
      tagline: "Plan · Research · Write · Judge",
      port: 8080,
      public_dir: "public",
    },
    goal: {
      name: "publishable_article",
      max_iterations: "6",
      require_all_criteria: true,
      criteria: [
        {
          id: "clarity",
          label: "Clarity",
          description: "Readable and concrete",
          weight: "1.0",
          threshold: "0.85",
        },
      ],
    },
    agents: {
      writer: {
        name: "Writer",
        output_key: "draft",
        instruction: "Write draft",
      },
    },
    workflow: {
      name: "writing_pipeline",
      entry: "write",
      end: "end",
      nodes: {
        write: { agent: "writer", next: "end" },
      },
    },
  });

  assert.equal(parsed.api.suggest_timeout_ms, 30000);
  assert.equal(parsed.api.poll_interval_ms, 2000);
  assert.equal(parsed.goal.max_iterations, 6);
  assert.equal(parsed.goal.criteria[0]?.weight, 1);
  assert.equal(parsed.goal.criteria[0]?.threshold, 0.85);
});
