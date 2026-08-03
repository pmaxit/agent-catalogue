import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQmd,
  markdownCalloutsToQuarto,
  markdownToSimpleHtml,
  renderNotebookHtml,
  stripQuillBlockMarkers,
  suggestFilename,
} from "../src/quarto.js";
import { resolveThemePlaybook } from "../src/themes.js";

test("resolveThemePlaybook maps studio theme cards", () => {
  assert.equal(
    resolveThemePlaybook("O'Reilly Book Chapter").id,
    "oreilly-book-chapter",
  );
  assert.equal(resolveThemePlaybook("Agentic Command").id, "agentic-command");
  assert.equal(resolveThemePlaybook("Executive Crisp").id, "executive-crisp");
});

test("buildQmd wraps markdown with theme YAML for local quarto preview", () => {
  const qmd = buildQmd({
    title: "Warm-Up Loops",
    bookTitle: "Practical Agents",
    theme: "O'Reilly Book Chapter",
    format: "O'Reilly-Style Book Chapter",
    audience: "Engineers",
    markdown: "# Warm-Up Loops\n\n> **Note:** Start small.\n\nBody text.",
  });
  assert.match(qmd, /^---\n/);
  assert.match(qmd, /title: Warm-Up Loops/);
  assert.match(qmd, /subtitle: Practical Agents/);
  assert.match(qmd, /theme: cosmo/);
  assert.match(qmd, /theme_id: oreilly-book-chapter/);
  assert.match(qmd, /::: \{\.callout-note\}/);
  assert.match(qmd, /Start small\./);
  assert.doesNotMatch(qmd, /> \*\*Note:\*\*/);
});

test("stripQuillBlockMarkers removes revise markers", () => {
  const md = stripQuillBlockMarkers(
    `<!--quill-block id="a1"-->\nHello\n<!--/quill-block-->`,
  );
  assert.equal(md, "Hello");
});

test("markdownCalloutsToQuarto converts tip callouts", () => {
  const out = markdownCalloutsToQuarto("> **Tip:** Use the cache.");
  assert.match(out, /callout-tip/);
  assert.match(out, /Use the cache\./);
});

test("renderNotebookHtml applies theme css class", () => {
  const html = renderNotebookHtml({
    title: "Exec brief",
    theme: "Executive Crisp",
    markdown: "# Exec brief\n\nShip it.",
  });
  assert.match(html, /qmd-theme-executive/);
  assert.match(html, /Quarto notebook/);
  assert.match(html, /Exec brief/);
});

test("suggestFilename slugifies titles", () => {
  assert.equal(suggestFilename({ title: "Hello World!" }), "hello-world.qmd");
});

test("markdownToSimpleHtml renders fenced code blocks", () => {
  const html = markdownToSimpleHtml(
    "Intro\n\n```python\nprint('hi')\n```\n\nOutro",
  );
  assert.match(html, /<pre><code class="language-python">/);
  assert.match(html, /print\('hi'\)/);
  assert.doesNotMatch(html, /```python/);
});

test("markdownToSimpleHtml renders GFM tables", () => {
  const html = markdownToSimpleHtml(
    "| Agent | Role |\n| --- | --- |\n| Writer | Draft |\n| Judge | Score |",
  );
  assert.match(html, /<table class="qmd-table">/);
  assert.match(html, /<th>Agent<\/th>/);
  assert.match(html, /<td>Writer<\/td>/);
  assert.doesNotMatch(html, /\| Agent \|/);
});
