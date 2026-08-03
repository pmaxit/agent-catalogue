/**
 * Quarto (.qmd) export and theme-styled notebook HTML preview.
 * No Quarto CLI — YAML is for local `quarto preview`; in-app uses HTML chrome.
 */

import { resolveThemePlaybook } from "./themes.js";

export type QmdBuildInput = {
  title: string;
  markdown: string;
  subtitle?: string;
  bookTitle?: string;
  theme?: string;
  format?: string;
  audience?: string;
  tone?: string;
  length?: string;
  goal?: string;
};

export type NotebookPreviewInput = QmdBuildInput & {
  /** When true, include a YAML summary strip in the chrome */
  showYaml?: boolean;
};

function yamlEscape(value: string): string {
  if (/[:#\[\]{},&*!|>'"%@`]/.test(value) || /^\s|\s$/.test(value)) {
    return JSON.stringify(value);
  }
  return value;
}

/** Strip selective-revise markers for clean Quarto export. */
export function stripQuillBlockMarkers(markdown: string): string {
  return markdown
    .replace(/<!--\s*quill-block\s+id=["']?[^"'>\s]+["']?\s*-->/gi, "")
    .replace(/<!--\s*\/quill-block\s*-->/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Convert `> **Note|Tip|Warning:** …` blockquotes into Quarto callouts.
 */
export function markdownCalloutsToQuarto(markdown: string): string {
  return markdown.replace(
    /^>\s*\*\*(Note|Tip|Warning):\*\*\s*(.+)$/gim,
    (_m, kind: string, rest: string) => {
      const type = String(kind).toLowerCase();
      return `::: {.callout-${type}}\n${rest.trim()}\n:::`;
    },
  );
}

export function buildQmd(input: QmdBuildInput): string {
  const playbook = resolveThemePlaybook(input.theme, input.format);
  const title = input.title.trim() || "Untitled";
  const subtitle =
    input.subtitle?.trim() ||
    (input.bookTitle?.trim() && input.bookTitle.trim() !== title
      ? input.bookTitle.trim()
      : undefined);

  const body = markdownCalloutsToQuarto(
    stripQuillBlockMarkers(input.markdown || ""),
  );

  const lines: string[] = ["---"];
  lines.push(`title: ${yamlEscape(title)}`);
  if (subtitle) lines.push(`subtitle: ${yamlEscape(subtitle)}`);
  if (input.audience?.trim()) {
    lines.push(`author: ${yamlEscape(input.audience.trim())}`);
  }
  lines.push("format:");
  lines.push("  html:");
  lines.push(`    theme: ${playbook.quarto.htmlTheme}`);
  lines.push(`    toc: ${playbook.quarto.toc}`);
  lines.push(`    code-fold: ${playbook.quarto.codeFold}`);
  lines.push(`    embed-resources: true`);
  lines.push("quill:");
  lines.push(`  theme_id: ${playbook.id}`);
  lines.push(`  theme_label: ${yamlEscape(playbook.label)}`);
  if (input.theme?.trim()) {
    lines.push(`  studio_theme: ${yamlEscape(input.theme.trim())}`);
  }
  if (input.goal?.trim()) {
    lines.push(`  goal: ${yamlEscape(input.goal.trim())}`);
  }
  if (input.tone?.trim()) {
    lines.push(`  tone: ${yamlEscape(input.tone.trim())}`);
  }
  if (input.format?.trim()) {
    lines.push(`  format: ${yamlEscape(input.format.trim())}`);
  }
  if (input.length?.trim()) {
    lines.push(`  length: ${yamlEscape(input.length.trim())}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(body);
  lines.push("");
  return lines.join("\n");
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>");
}

function splitTableRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))
  );
}

function isTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && !t.startsWith("```");
}

/** Render a GFM pipe table to HTML. */
export function markdownTableToHtml(tableMarkdown: string): string {
  const lines = tableMarkdown
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
  if (lines.length < 2) return `<p>${inlineFormat(escapeHtml(tableMarkdown))}</p>`;

  let header = splitTableRow(lines[0]!);
  let bodyLines = lines.slice(1);
  if (bodyLines[0] && isTableSeparator(bodyLines[0])) {
    bodyLines = bodyLines.slice(1);
  } else {
    // No separator — treat first row as header anyway for display
  }

  const thead = `<thead><tr>${header
    .map((c) => `<th>${inlineFormat(escapeHtml(c))}</th>`)
    .join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyLines
    .map((line) => {
      const cells = splitTableRow(line);
      while (cells.length < header.length) cells.push("");
      return `<tr>${cells
        .slice(0, Math.max(header.length, cells.length))
        .map((c) => `<td>${inlineFormat(escapeHtml(c))}</td>`)
        .join("")}</tr>`;
    })
    .join("")}</tbody>`;

  return `<div class="qmd-table-wrap"><table class="qmd-table">${thead}${tbody}</table></div>`;
}

function renderCodeBlock(lang: string, code: string): string {
  const language = (lang || "").trim();
  const cls = language ? ` class="language-${escapeHtml(language)}"` : "";
  const label = language
    ? `<div class="qmd-code-label">${escapeHtml(language)}</div>`
    : "";
  return `<div class="qmd-code">${label}<pre><code${cls}>${escapeHtml(code.replace(/\n$/, ""))}</code></pre></div>`;
}

/**
 * Lightweight markdown → HTML for notebook body.
 * Handles fenced code, GFM tables, callouts, lists, headings.
 */
export function markdownToSimpleHtml(markdown: string): string {
  let text = stripQuillBlockMarkers(markdown).replace(/\r\n/g, "\n");
  const placeholders: string[] = [];
  const hold = (html: string) => {
    placeholders.push(html);
    return `\n\n%%HOLD_${placeholders.length - 1}%%\n\n`;
  };

  // draw.io fences
  text = text.replace(
    /```(?:drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi,
    (_m, xml) => {
      const encoded = "R" + encodeURIComponent(String(xml).trim());
      const viewer = `https://viewer.diagrams.net/?highlight=0000ff&edit=_blank&layers=1&nav=1&title=Diagram#${encoded}`;
      const editor = `https://app.diagrams.net/?splash=0&libs=general;flowchart#${encoded}`;
      return hold(`<figure class="diagram-figure" data-diagram="drawio">
  <div class="diagram-toolbar">
    <span class="mono-stamp">draw.io</span>
    <a class="diagram-link" href="${editor}" target="_blank" rel="noopener">Open in draw.io</a>
  </div>
  <iframe class="diagram-frame" title="draw.io diagram" src="${viewer}" loading="lazy" referrerpolicy="no-referrer"></iframe>
</figure>`);
    },
  );

  // Fenced code blocks
  text = text.replace(/```([^\n`]*)\n([\s\S]*?)```/g, (_m, lang, code) =>
    hold(renderCodeBlock(String(lang || ""), String(code))),
  );

  // Quarto callouts
  text = text.replace(
    /:::\s*\{\.callout-(note|tip|warning)\}\s*\n([\s\S]*?)\n:::/gi,
    (_m, kind, body) =>
      hold(
        `<aside class="qmd-callout qmd-callout-${String(kind).toLowerCase()}"><strong>${escapeHtml(String(kind))}</strong><p>${inlineFormat(escapeHtml(String(body).trim()))}</p></aside>`,
      ),
  );

  // GFM tables — consecutive pipe rows
  const lines = text.split("\n");
  const outLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (
      isTableRow(line) &&
      i + 1 < lines.length &&
      (isTableSeparator(lines[i + 1]!) || isTableRow(lines[i + 1]!))
    ) {
      const tableLines: string[] = [line];
      i += 1;
      while (i < lines.length && isTableRow(lines[i]!)) {
        tableLines.push(lines[i]!);
        i += 1;
      }
      i -= 1;
      outLines.push(hold(markdownTableToHtml(tableLines.join("\n"))));
    } else {
      outLines.push(line);
    }
  }
  text = outLines.join("\n");

  const chunks = text.split(/\n{2,}/);
  const htmlParts: string[] = [];

  for (const rawChunk of chunks) {
    const chunk = rawChunk.trim();
    if (!chunk) continue;

    const holdMatch = chunk.match(/^%%HOLD_(\d+)%%$/);
    if (holdMatch) {
      htmlParts.push(placeholders[Number(holdMatch[1])] || "");
      continue;
    }

    // Mixed hold markers inside chunk
    if (/%%HOLD_\d+%%/.test(chunk)) {
      htmlParts.push(
        chunk.replace(/%%HOLD_(\d+)%%/g, (_m, idx) => placeholders[Number(idx)] || ""),
      );
      continue;
    }

    const chunkLines = chunk.split("\n");
    if (/^### /.test(chunk)) {
      htmlParts.push(
        `<h3>${inlineFormat(escapeHtml(chunk.replace(/^### /, "")))}</h3>`,
      );
      continue;
    }
    if (/^## /.test(chunk)) {
      htmlParts.push(
        `<h2>${inlineFormat(escapeHtml(chunk.replace(/^## /, "")))}</h2>`,
      );
      continue;
    }
    if (/^# /.test(chunk)) {
      htmlParts.push(
        `<h1>${inlineFormat(escapeHtml(chunk.replace(/^# /, "")))}</h1>`,
      );
      continue;
    }

    if (
      chunkLines.every((l) => /^>\s?/.test(l) || l.trim() === "")
    ) {
      const body = chunkLines
        .map((l) => l.replace(/^>\s?/, ""))
        .join("\n")
        .trim();
      const note = body.match(/^\*\*(Note|Tip|Warning):\*\*\s*([\s\S]*)$/i);
      if (note) {
        htmlParts.push(
          `<aside class="qmd-callout qmd-callout-${note[1]!.toLowerCase()}"><strong>${escapeHtml(note[1]!)}</strong><p>${inlineFormat(escapeHtml(note[2]!.trim()))}</p></aside>`,
        );
      } else {
        htmlParts.push(
          `<blockquote>${body
            .split("\n")
            .map((l) => `<p>${inlineFormat(escapeHtml(l))}</p>`)
            .join("")}</blockquote>`,
        );
      }
      continue;
    }

    if (
      chunkLines.filter((l) => l.trim()).every((l) => /^[-*]\s+/.test(l))
    ) {
      htmlParts.push(
        `<ul>${chunkLines
          .filter((l) => l.trim())
          .map(
            (l) =>
              `<li>${inlineFormat(escapeHtml(l.replace(/^[-*]\s+/, "")))}</li>`,
          )
          .join("")}</ul>`,
      );
      continue;
    }

    if (
      chunkLines.filter((l) => l.trim()).every((l) => /^\d+\.\s+/.test(l))
    ) {
      htmlParts.push(
        `<ol>${chunkLines
          .filter((l) => l.trim())
          .map(
            (l) =>
              `<li>${inlineFormat(escapeHtml(l.replace(/^\d+\.\s+/, "")))}</li>`,
          )
          .join("")}</ol>`,
      );
      continue;
    }

    htmlParts.push(
      `<p>${inlineFormat(escapeHtml(chunk)).replace(/\n/g, "<br />")}</p>`,
    );
  }

  return htmlParts.join("\n");
}

export function renderNotebookHtml(input: NotebookPreviewInput): string {
  const playbook = resolveThemePlaybook(input.theme, input.format);
  const title = input.title.trim() || "Untitled draft";
  const subtitle =
    input.subtitle?.trim() ||
    (input.bookTitle?.trim() && input.bookTitle.trim() !== title
      ? input.bookTitle.trim()
      : "");

  const chips: string[] = [
    `<span class="qmd-chip">theme: ${escapeHtml(playbook.quarto.htmlTheme)}</span>`,
    `<span class="qmd-chip">toc: ${playbook.quarto.toc}</span>`,
  ];
  if (input.format?.trim()) {
    chips.push(
      `<span class="qmd-chip">${escapeHtml(input.format.trim())}</span>`,
    );
  }
  if (input.length?.trim()) {
    chips.push(
      `<span class="qmd-chip">${escapeHtml(input.length.trim())}</span>`,
    );
  }

  const bodyHtml = markdownToSimpleHtml(input.markdown || "");

  return `<article class="qmd-notebook ${playbook.quarto.cssClass}" data-theme-id="${escapeHtml(playbook.id)}">
  <header class="qmd-notebook-chrome">
    <div class="qmd-chrome-row">
      <span class="mono-stamp">Quarto notebook · .qmd</span>
      <span class="qmd-theme-label">${escapeHtml(playbook.label)}</span>
    </div>
    <h1 class="qmd-title">${escapeHtml(title)}</h1>
    ${subtitle ? `<p class="qmd-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    <p class="qmd-blurb">${escapeHtml(playbook.quarto.blurb)}</p>
    ${input.showYaml === false ? "" : `<div class="qmd-yaml-chips">${chips.join("")}</div>`}
  </header>
  <div class="qmd-body">${bodyHtml}</div>
</article>`;
}

export function suggestFilename(input: {
  title?: string;
  slug?: string;
}): string {
  const base =
    (input.slug || input.title || "quill-draft")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 64) || "quill-draft";
  return `${base}.qmd`;
}
