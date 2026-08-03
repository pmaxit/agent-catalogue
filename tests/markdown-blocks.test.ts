import assert from "node:assert/strict";
import test from "node:test";
import { blocksToHtml } from "../src/article-pages.js";
import { blocksToMarkdown, markdownToBlocks } from "../src/db.js";

test("markdownToBlocks preserves code fences and tables", () => {
  const md = `# Title

\`\`\`js
const x = 1;
\`\`\`

| Col | Val |
| --- | --- |
| a | 1 |

Done.`;
  const blocks = markdownToBlocks(md);
  const types = blocks.map((b) => b.type);
  assert.ok(types.includes("h1"));
  assert.ok(types.includes("code"));
  assert.ok(types.includes("table"));
  assert.ok(types.includes("paragraph"));

  const roundTrip = blocksToMarkdown(blocks);
  assert.match(roundTrip, /```js/);
  assert.match(roundTrip, /const x = 1/);
  assert.match(roundTrip, /\| Col \| Val \|/);

  const html = blocksToHtml(blocks);
  assert.match(html, /language-js/);
  assert.match(html, /qmd-table/);
  assert.match(html, /<td>a<\/td>/);
});
