import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { buildFlowMxfile, hasDrawioDiagram } from "./diagrams.js";

export type Block = {
  id: string | number;
  type: "h1" | "h2" | "h3" | "blockquote" | "paragraph" | "list" | "drawio" | string;
  text: string;
  html?: string;
};

export type ArticleMeta = {
  brief?: string;
  audience?: string;
  tone?: string;
  format?: string;
  length?: string;
  theme?: string;
  goal?: string;
};

export type ArticleRecord = {
  id: string;
  slug: string;
  title: string;
  body_markdown: string;
  body_html: string | null;
  blocks_json: string;
  brief: string | null;
  audience: string | null;
  tone: string | null;
  format: string | null;
  length: string | null;
  theme: string | null;
  goal: string | null;
  status: string;
  revision: number;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

export type RevisionRecord = {
  id: number;
  article_id: string;
  revision: number;
  title: string;
  body_markdown: string;
  body_html: string | null;
  blocks_json: string;
  change_summary: string | null;
  created_at: string;
};

export type PublishInput = {
  id?: string;
  slug?: string;
  title?: string;
  bodyMarkdown?: string;
  bodyHtml?: string;
  blocks?: Block[];
  meta?: ArticleMeta;
  changeSummary?: string;
  status?: "draft" | "published";
};

function nowIso(): string {
  return new Date().toISOString();
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      const text = b.text ?? "";
      switch (b.type) {
        case "h1":
          return `# ${text}`;
        case "h2":
          return `## ${text}`;
        case "h3":
          return `### ${text}`;
        case "blockquote":
          return text
            .split("\n")
            .map((line) => `> ${line}`)
            .join("\n");
        case "list":
          return text
            .split("\n")
            .filter(Boolean)
            .map((line) => (line.startsWith("- ") || line.startsWith("* ") ? line : `- ${line}`))
            .join("\n");
        case "drawio":
          return `\`\`\`drawio\n${text}\n\`\`\``;
        default:
          return text;
      }
    })
    .join("\n\n");
}

export function markdownToBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  const fenceRe =
    /```(drawio|diagrams\.net|mxfile)\s*\n([\s\S]*?)```/gi;
  let last = 0;
  let match: RegExpExecArray | null;
  const fenceMatches: Array<{ start: number; end: number; xml: string }> = [];
  while ((match = fenceRe.exec(markdown)) !== null) {
    fenceMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      xml: match[2].trim(),
    });
  }

  const pushProse = (chunk: string) => {
    const parts = chunk.split(/\n\s*\n/).filter((p) => p.trim());
    for (const pText of parts) {
      let type: Block["type"] = "paragraph";
      let clean = pText.trim();
      if (clean.startsWith("# ")) {
        type = "h1";
        clean = clean.replace(/^#\s+/, "");
      } else if (clean.startsWith("## ")) {
        type = "h2";
        clean = clean.replace(/^##\s+/, "");
      } else if (clean.startsWith("### ")) {
        type = "h3";
        clean = clean.replace(/^###\s+/, "");
      } else if (clean.split("\n").every((l) => l.startsWith("> ") || l === ">")) {
        type = "blockquote";
        clean = clean
          .split("\n")
          .map((l) => l.replace(/^>\s?/, ""))
          .join("\n");
      } else if (
        clean.split("\n").length > 1 &&
        clean.split("\n").every((l) => /^[-*]\s+/.test(l) || l.trim() === "")
      ) {
        type = "list";
        clean = clean
          .split("\n")
          .filter((l) => l.trim())
          .map((l) => l.replace(/^[-*]\s+/, ""))
          .join("\n");
      }
      blocks.push({ id: blocks.length + 1, type, text: clean });
    }
  };

  if (!fenceMatches.length) {
    pushProse(markdown);
    return blocks;
  }

  for (const f of fenceMatches) {
    pushProse(markdown.slice(last, f.start));
    blocks.push({
      id: blocks.length + 1,
      type: "drawio",
      text: f.xml,
    });
    last = f.end;
  }
  pushProse(markdown.slice(last));
  return blocks;
}

function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || `article-${Date.now()}`;
}

function titleFromMarkdown(md: string): string {
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1?.[1]) return h1[1].trim();
  const first = md.split("\n").find((l) => l.trim());
  return (first || "Untitled").trim().slice(0, 120);
}

export function resolveDbPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.SQLITE_PATH?.trim()) return env.SQLITE_PATH.trim();
  if (env.RAILWAY_VOLUME_MOUNT_PATH?.trim()) {
    return resolve(env.RAILWAY_VOLUME_MOUNT_PATH.trim(), "quill.db");
  }
  return resolve(process.cwd(), "data", "quill.db");
}

export class ArticleStore {
  readonly db: Database.Database;
  readonly path: string;

  constructor(dbPath = resolveDbPath()) {
    this.path = dbPath;
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        body_html TEXT,
        blocks_json TEXT NOT NULL,
        brief TEXT,
        audience TEXT,
        tone TEXT,
        format TEXT,
        length TEXT,
        theme TEXT,
        goal TEXT,
        status TEXT NOT NULL DEFAULT 'published',
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        published_at TEXT
      );

      CREATE TABLE IF NOT EXISTS article_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        body_html TEXT,
        blocks_json TEXT NOT NULL,
        change_summary TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(article_id, revision)
      );

      CREATE INDEX IF NOT EXISTS idx_articles_updated ON articles(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_revisions_article ON article_revisions(article_id, revision DESC);
    `);
  }

  private uniqueSlug(desired: string, excludeId?: string): string {
    let slug = slugify(desired);
    let n = 2;
    for (;;) {
      const row = this.db
        .prepare(`SELECT id FROM articles WHERE slug = ?`)
        .get(slug) as { id: string } | undefined;
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(desired)}-${n++}`;
    }
  }

  list(limit = 50): ArticleRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM articles ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(limit) as ArticleRecord[];
  }

  get(idOrSlug: string): ArticleRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM articles WHERE id = ? OR slug = ?`)
      .get(idOrSlug, idOrSlug) as ArticleRecord | undefined;
  }

  history(articleId: string): RevisionRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM article_revisions WHERE article_id = ? ORDER BY revision DESC`,
      )
      .all(articleId) as RevisionRecord[];
  }

  getRevision(articleId: string, revision: number): RevisionRecord | undefined {
    return this.db
      .prepare(
        `SELECT * FROM article_revisions WHERE article_id = ? AND revision = ?`,
      )
      .get(articleId, revision) as RevisionRecord | undefined;
  }

  publish(input: PublishInput): ArticleRecord {
    const ts = nowIso();
    const blocks =
      input.blocks && input.blocks.length > 0
        ? input.blocks
        : markdownToBlocks(input.bodyMarkdown || "");
    const bodyMarkdown =
      input.bodyMarkdown?.trim() || blocksToMarkdown(blocks);
    if (!bodyMarkdown.trim()) {
      throw new Error("Article body is required");
    }
    const title =
      input.title?.trim() || titleFromMarkdown(bodyMarkdown) || "Untitled";
    const blocksJson = JSON.stringify(blocks);
    const bodyHtml = input.bodyHtml ?? null;
    const status = input.status ?? "published";
    const meta = input.meta ?? {};

    const existing = input.id ? this.get(input.id) : undefined;

    const run = this.db.transaction(() => {
      if (existing) {
        const nextRev = existing.revision + 1;
        const slug = this.uniqueSlug(input.slug || existing.slug, existing.id);
        this.db
          .prepare(
            `UPDATE articles SET
              slug = ?, title = ?, body_markdown = ?, body_html = ?, blocks_json = ?,
              brief = ?, audience = ?, tone = ?, format = ?, length = ?, theme = ?, goal = ?,
              status = ?, revision = ?, updated_at = ?,
              published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
             WHERE id = ?`,
          )
          .run(
            slug,
            title,
            bodyMarkdown,
            bodyHtml,
            blocksJson,
            meta.brief ?? existing.brief,
            meta.audience ?? existing.audience,
            meta.tone ?? existing.tone,
            meta.format ?? existing.format,
            meta.length ?? existing.length,
            meta.theme ?? existing.theme,
            meta.goal ?? existing.goal,
            status,
            nextRev,
            ts,
            status,
            ts,
            existing.id,
          );

        this.db
          .prepare(
            `INSERT INTO article_revisions
              (article_id, revision, title, body_markdown, body_html, blocks_json, change_summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            existing.id,
            nextRev,
            title,
            bodyMarkdown,
            bodyHtml,
            blocksJson,
            input.changeSummary ?? "Edit saved",
            ts,
          );

        return this.get(existing.id)!;
      }

      const id = randomUUID();
      const slug = this.uniqueSlug(input.slug || title);
      this.db
        .prepare(
          `INSERT INTO articles (
            id, slug, title, body_markdown, body_html, blocks_json,
            brief, audience, tone, format, length, theme, goal,
            status, revision, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          slug,
          title,
          bodyMarkdown,
          bodyHtml,
          blocksJson,
          meta.brief ?? null,
          meta.audience ?? null,
          meta.tone ?? null,
          meta.format ?? null,
          meta.length ?? null,
          meta.theme ?? null,
          meta.goal ?? null,
          status,
          ts,
          ts,
          status === "published" ? ts : null,
        );

      this.db
        .prepare(
          `INSERT INTO article_revisions
            (article_id, revision, title, body_markdown, body_html, blocks_json, change_summary, created_at)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          title,
          bodyMarkdown,
          bodyHtml,
          blocksJson,
          input.changeSummary ?? "Initial publish",
          ts,
        );

      return this.get(id)!;
    });

    return run();
  }

  seedIfEmpty(articles: PublishInput[]): number {
    const count = (
      this.db.prepare(`SELECT COUNT(*) AS c FROM articles`).get() as { c: number }
    ).c;
    if (count > 0) return 0;
    let n = 0;
    for (const a of articles) {
      this.publish({ ...a, changeSummary: "Seeded sample article" });
      n += 1;
    }
    return n;
  }

  /** Ensure seeded/sample articles include a draw.io diagram revision when missing. */
  ensureDiagramsOnPublished(): number {
    const rows = this.list(200).filter((a) => a.status === "published");
    let updated = 0;
    for (const row of rows) {
      if (hasDrawioDiagram(row.body_markdown)) continue;
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
      const bodyMarkdown = `${row.body_markdown.trim()}\n\n## Pipeline diagram\n\n\`\`\`drawio\n${mx}\n\`\`\`\n`;
      this.publish({
        id: row.id,
        title: row.title,
        bodyMarkdown,
        changeSummary: "Added draw.io workflow diagram",
        status: "published",
      });
      updated += 1;
    }
    return updated;
  }

  close(): void {
    this.db.close();
  }
}

const SAMPLE_PIPELINE_MX = buildFlowMxfile(
  "Writing pipeline",
  ["Plan", "Research", "Write", "Judge"],
  [
    { from: 0, to: 1 },
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 2, label: "revise" },
  ],
);

export const SAMPLE_ARTICLES: PublishInput[] = [
  {
    slug: "delegating-the-draft",
    title: "Delegating the draft without soft exits on quality",
    status: "published",
    meta: {
      theme: "Agentic Command",
      goal: "Thought Leadership & Opinion Essay",
      tone: "precise, delegated, outcome-first, traceable",
      format: "Long-form Agentic Essay",
      audience: "Engineering leads & product directors",
    },
    bodyMarkdown: `# Delegating the draft without soft exits on quality

Multi-agent writing systems fail quietly when the judge can shrug. Quill treats quality criteria as hard gates — and routes revise until they clear.

Most “AI writing” products optimize for first-token latency. That is the wrong north star if the artifact has to survive an editor’s desk. Quill is built around a different contract: a YAML-defined graph of agents that must return scores, and a manager that cannot exit while any criterion sits below its threshold.

The pipeline is deliberately boring. A planner shapes the angle. A researcher gathers constraints the writer is not allowed to invent. The writer produces a draft in a selected theme voice. The manager scores correctness, helpfulness, clarity, images, and draw.io diagrams — then chooses revise or done.

> Soft exits are how drafts become “good enough.” Hard gates are how drafts become publishable.

\`\`\`drawio
${SAMPLE_PIPELINE_MX}
\`\`\`

## Why the graph is configuration, not ceremony

Every agent name, model id, instruction template, and edge lives in \`config/agents.yaml\`. That is not a documentation habit — it is the runtime source of truth. Swap a model, raise a threshold, or rewire a route without opening the orchestrator. Templates accept brief fields, criteria lists, and prior outputs through a small expression language.

When \`CURSOR_API_KEY\` is absent, Quill runs in mock mode so the studio UI and SSE stream remain exerciseable. That keeps the feedback loop local while the cloud path stays ready for real runs.

## What the judge is forced to answer

The manager response is structured. It must include scores, a passed flag, a route, and feedback. The orchestrator still forces \`revise\` if any criterion is below its YAML threshold — even if the model claims success. That second line of defense is intentional: models negotiate; thresholds do not.

- Correctness — claims grounded in research, not invented certainty
- Helpfulness — the piece answers the brief for the stated audience
- Clarity — structure, scannability, and prose that holds attention
- Images — figures proposed where they earn their place
- Diagrams — draw.io workflow / architecture graphs that explain the system

## Theme as a first-class input

Voice is not a late prompt sprinkle. The studio binds a writing goal and a narrative theme before the run. Tone and format flow into the writer and evaluator prompts so “Agentic Command” and “Executive Crisp” are not the same essay with different adjectives bolted on.

> Treat theme like a design system for prose: constrained tokens, clear anti-patterns, and a voice that survives revision loops.

## What ship looks like

In the studio, publish mode turns the draft into editable blocks — reorder, insert, delete — then export Markdown. Every publish and edit is stored in SQLite with a full revision snapshot so formatting, text, diagrams, and structure survive across sessions.
`,
  },
];
