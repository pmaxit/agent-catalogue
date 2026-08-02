/**
 * Draw.io / diagrams.net helpers for Quill articles.
 * Diagrams are stored as fenced ```drawio blocks containing mxfile XML.
 */

const DRAWIO_FENCE =
  /```(?:drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi;

export function extractDrawioBlocks(markdown: string): string[] {
  const out: string[] = [];
  for (const match of markdown.matchAll(DRAWIO_FENCE)) {
    const xml = match[1]?.trim();
    if (xml) out.push(xml);
  }
  return out;
}

export function hasDrawioDiagram(markdown: string): boolean {
  return extractDrawioBlocks(markdown).length > 0;
}

export function hasWorkflowDiagramSignal(markdown: string): boolean {
  if (hasDrawioDiagram(markdown)) return true;
  // Mermaid flowchart/sequence as a weaker signal (not preferred)
  return /```mermaid[\s\S]*?(flowchart|graph|sequenceDiagram)/i.test(markdown);
}

/** Encode XML for diagrams.net viewer hash (#R...). */
export function encodeDrawioViewerHash(xml: string): string {
  return "R" + encodeURIComponent(xml.trim());
}

export function drawioViewerUrl(xml: string, title = "Quill diagram"): string {
  const params = new URLSearchParams({
    highlight: "0000ff",
    edit: "_blank",
    layers: "1",
    nav: "1",
    title,
  });
  return `https://viewer.diagrams.net/?${params.toString()}#${encodeDrawioViewerHash(xml)}`;
}

export function drawioEditorUrl(xml: string): string {
  return `https://app.diagrams.net/?splash=0&libs=general;flowchart#${encodeDrawioViewerHash(xml)}`;
}

function escapeAttr(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

export function renderDrawioEmbed(
  xml: string,
  opts: { title?: string; index?: number } = {},
): string {
  const title = opts.title || `Diagram ${(opts.index ?? 0) + 1}`;
  const viewer = drawioViewerUrl(xml, title);
  const editor = drawioEditorUrl(xml);
  const id = `drawio-${opts.index ?? 0}-${Math.abs(hashCode(xml)).toString(36)}`;
  return `<figure class="diagram-figure" data-diagram="drawio" id="${id}">
  <div class="diagram-toolbar">
    <span class="mono-stamp">draw.io</span>
    <a class="diagram-link" href="${escapeAttr(editor)}" target="_blank" rel="noopener">Open in draw.io</a>
  </div>
  <iframe
    class="diagram-frame"
    title="${escapeAttr(title)}"
    src="${escapeAttr(viewer)}"
    loading="lazy"
    referrerpolicy="no-referrer"
  ></iframe>
  <figcaption>${escapeAttr(title)} — edit opens in diagrams.net</figcaption>
</figure>`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** Replace drawio fences in markdown with HTML embeds; leave other markdown intact. */
export function replaceDrawioFencesWithHtml(markdown: string): string {
  let i = 0;
  return markdown.replace(DRAWIO_FENCE, (_full, xml: string) => {
    const html = renderDrawioEmbed(xml, {
      title: `Workflow diagram ${i + 1}`,
      index: i,
    });
    i += 1;
    // Use a sentinel the markdown renderer won't wrap as a paragraph
    return `\n\n@@@DRAWIO_EMBED_${i - 1}@@@\n\n___DRAWIO_HTML_${i - 1}___\n${html}\n___END_DRAWIO___\n\n`;
  });
}

/**
 * Minimal mxfile for a horizontal flow of labeled nodes.
 * Used by mock writer and as a template in agent prompts.
 */
export function buildFlowMxfile(
  name: string,
  nodes: string[],
  edges?: Array<{ from: number; to: number; label?: string }>,
): string {
  const cells: string[] = [
    `<mxCell id="0"/>`,
    `<mxCell id="1" parent="0"/>`,
  ];
  nodes.forEach((label, idx) => {
    const id = String(idx + 2);
    const x = 40 + idx * 160;
    cells.push(
      `<mxCell id="${id}" value="${escapeXml(label)}" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontFamily=Inter;fontSize=12;" vertex="1" parent="1"><mxGeometry x="${x}" y="80" width="120" height="52" as="geometry"/></mxCell>`,
    );
  });
  const linkEdges: Array<{ from: number; to: number; label?: string }> =
    edges ??
    nodes.slice(0, -1).map((_, i) => ({ from: i, to: i + 1 }));
  linkEdges.forEach((e, i) => {
    const id = String(nodes.length + 2 + i);
    const source = String(e.from + 2);
    const target = String(e.to + 2);
    const value = e.label ? ` value="${escapeXml(e.label)}"` : "";
    cells.push(
      `<mxCell id="${id}"${value} style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#6c8ebf;fontSize=11;" edge="1" parent="1" source="${source}" target="${target}"><mxGeometry relative="1" as="geometry"/></mxCell>`,
    );
  });

  return `<mxfile host="app.diagrams.net" modified="2026-08-02T00:00:00.000Z" agent="Quill" version="22.1.0" type="device">
  <diagram id="quill-${slugify(name)}" name="${escapeXml(name)}">
    <mxGraphModel dx="1000" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100">
      <root>
        ${cells.join("\n        ")}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "diagram";
}

export const DRAWIO_AUTHORING_GUIDE = `
## Draw.io diagram format (required)

Embed workflow / architecture / explanation graphs as fenced draw.io XML:

\`\`\`drawio
<mxfile host="app.diagrams.net">
  <diagram name="Pipeline" id="pipeline">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <!-- vertices: rounded rectangles; edges: orthogonal arrows -->
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
\`\`\`

Rules:
- Prefer draw.io (\`\`\`drawio) over mermaid for judging credit.
- At least one diagram must explain a process, architecture, or decision flow.
- Place the diagram near the section it clarifies (after intro or before the playbook).
- Keep labels short; use arrows for sequence; group related steps.
- Valid mxfile XML only inside the fence (no markdown inside the fence).
`.trim();
