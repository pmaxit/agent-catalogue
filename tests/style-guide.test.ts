import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";
import { loadStyleGuide } from "../src/style-guide.js";

test("loadStyleGuide reads the mandatory data/style.md guide", () => {
  const guide = loadStyleGuide();
  assert.ok(guide.length > 0, "style guide should not be empty");
  assert.match(guide, /Writing and Design Style Guide/);
  assert.match(guide, /Anti-Patterns/);
});

test("loadStyleGuide returns empty string for a missing file", () => {
  assert.equal(loadStyleGuide("/nonexistent/style.md"), "");
});

test("config enforces style_fidelity above 99% and wires the style guide", () => {
  const config = loadConfig();

  const styleCriterion = config.goal.criteria.find(
    (c) => c.id === "style_fidelity",
  );
  assert.ok(styleCriterion, "style_fidelity criterion must exist");
  assert.equal(styleCriterion.threshold, 0.99);
  assert.match(styleCriterion.description, /data\/style\.md/);

  for (const key of ["planner", "writer", "manager"] as const) {
    const agent = config.agents[key];
    assert.ok(agent, `${key} agent must exist`);
    assert.match(
      agent.instruction,
      /\{\{style_guide\}\}/,
      `${key} instruction must include the style guide`,
    );
    assert.match(
      agent.description ?? "",
      /style/i,
      `${key} description must mention the style guidance`,
    );
  }

  assert.match(config.agents.manager!.instruction, /"style_fidelity"/);
  assert.match(config.agents.writer!.description ?? "", /99%/);
});
