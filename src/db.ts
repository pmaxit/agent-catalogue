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

export type BookRecord = {
  id: string;
  slug: string;
  title: string;
  synopsis: string | null;
  overview_markdown: string;
  overview_blocks_json: string;
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

export type ChapterRecord = {
  id: string;
  book_id: string;
  slug: string;
  title: string;
  sort_order: number;
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

export type ChapterRevisionRecord = {
  id: number;
  chapter_id: string;
  revision: number;
  title: string;
  body_markdown: string;
  body_html: string | null;
  blocks_json: string;
  change_summary: string | null;
  created_at: string;
};

export type BookInput = {
  id?: string;
  slug?: string;
  title: string;
  synopsis?: string;
  overviewMarkdown?: string;
  overviewBlocks?: Block[];
  meta?: ArticleMeta;
  status?: "draft" | "published";
};

export type ChapterInput = {
  id?: string;
  bookId: string;
  slug?: string;
  title?: string;
  sortOrder?: number;
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
        case "code": {
          const nl = text.indexOf("\n");
          const lang = nl >= 0 ? text.slice(0, nl) : "";
          const body = nl >= 0 ? text.slice(nl + 1) : text;
          return `\`\`\`${lang}\n${body}\n\`\`\``;
        }
        case "table":
          return text;
        default:
          return text;
      }
    })
    .join("\n\n");
}

function isMdTableSeparator(line: string): boolean {
  const cells = line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
  return (
    cells.length > 0 &&
    cells.every((c) => /^:?-{3,}:?$/.test(c.replace(/\s/g, "")))
  );
}

function isMdTableRow(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && !t.startsWith("```");
}

export function markdownToBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  // All fenced blocks (drawio or code)
  const fenceRe = /```([^\n`]*)\n([\s\S]*?)```/g;
  let last = 0;
  let match: RegExpExecArray | null;
  const fenceMatches: Array<{
    start: number;
    end: number;
    lang: string;
    body: string;
  }> = [];
  while ((match = fenceRe.exec(markdown)) !== null) {
    fenceMatches.push({
      start: match.index,
      end: match.index + match[0].length,
      lang: (match[1] || "").trim(),
      body: match[2].replace(/\n$/, ""),
    });
  }

  const pushProse = (chunk: string) => {
    const normalized = chunk.replace(/\r\n/g, "\n");
    const lines = normalized.split("\n");
    let i = 0;
    let buf: string[] = [];

    const flushBuf = () => {
      const pText = buf.join("\n").trim();
      buf = [];
      if (!pText) return;
      let type: Block["type"] = "paragraph";
      let clean = pText;
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
      blocks.push({ id: randomUUID(), type, text: clean });
    };

    while (i < lines.length) {
      const line = lines[i]!;
      if (
        isMdTableRow(line) &&
        i + 1 < lines.length &&
        (isMdTableSeparator(lines[i + 1]!) || isMdTableRow(lines[i + 1]!))
      ) {
        flushBuf();
        const tableLines: string[] = [line];
        i += 1;
        while (i < lines.length && isMdTableRow(lines[i]!)) {
          tableLines.push(lines[i]!);
          i += 1;
        }
        blocks.push({
          id: randomUUID(),
          type: "table",
          text: tableLines.join("\n"),
        });
        continue;
      }
      if (line.trim() === "") {
        flushBuf();
        i += 1;
        continue;
      }
      buf.push(line);
      i += 1;
    }
    flushBuf();
  };

  if (!fenceMatches.length) {
    pushProse(markdown);
    return blocks;
  }

  for (const f of fenceMatches) {
    pushProse(markdown.slice(last, f.start));
    const langLower = f.lang.toLowerCase();
    if (
      langLower === "drawio" ||
      langLower === "diagrams.net" ||
      langLower === "mxfile"
    ) {
      blocks.push({
        id: randomUUID(),
        type: "drawio",
        text: f.body.trim(),
      });
    } else {
      blocks.push({
        id: randomUUID(),
        type: "code",
        text: `${f.lang}\n${f.body}`,
      });
    }
    last = f.end;
  }
  pushProse(markdown.slice(last));
  return blocks;
}

/** Parse writer output that wraps revised sections in quill-block markers. */
export function parseMarkedBlocks(markdown: string): Block[] {
  const re =
    /<!--\s*quill-block\s+id=["']([^"']+)["']\s*(?:type=["']([^"']*)["'])?\s*-->([\s\S]*?)<!--\s*\/quill-block\s*-->/gi;
  const found: Block[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const id = m[1];
    const typeHint = (m[2] || "").trim();
    const inner = m[3].trim();
    const parsed = markdownToBlocks(inner);
    if (parsed.length === 1) {
      found.push({ ...parsed[0], id, type: typeHint || parsed[0].type });
    } else if (parsed.length > 1) {
      found.push({
        id,
        type: typeHint || "paragraph",
        text: blocksToMarkdown(parsed),
      });
    } else {
      found.push({ id, type: typeHint || "paragraph", text: inner });
    }
  }
  return found;
}

export function ensureBlockIds(blocks: Block[]): Block[] {
  return blocks.map((b) => ({
    ...b,
    id: b.id != null && String(b.id).length ? b.id : randomUUID(),
  }));
}

export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return base || `article-${Date.now()}`;
}

export function mergeBlocksById(
  current: Block[],
  updates: Block[],
  selectedIds?: Array<string | number>,
): Block[] {
  const allow = selectedIds?.length
    ? new Set(selectedIds.map(String))
    : null;
  const byId = new Map(
    updates
      .filter((u) => !allow || allow.has(String(u.id)))
      .map((u) => [String(u.id), u]),
  );
  if (!byId.size) return current;
  return current.map((b) => {
    const next = byId.get(String(b.id));
    return next ? { ...b, type: next.type || b.type, text: next.text } : b;
  });
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

      CREATE TABLE IF NOT EXISTS books (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        synopsis TEXT,
        overview_markdown TEXT NOT NULL DEFAULT '',
        overview_blocks_json TEXT NOT NULL DEFAULT '[]',
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

      CREATE TABLE IF NOT EXISTS chapters (
        id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
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
        published_at TEXT,
        UNIQUE(book_id, slug)
      );

      CREATE TABLE IF NOT EXISTS chapter_revisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
        revision INTEGER NOT NULL,
        title TEXT NOT NULL,
        body_markdown TEXT NOT NULL,
        body_html TEXT,
        blocks_json TEXT NOT NULL,
        change_summary TEXT,
        created_at TEXT NOT NULL,
        UNIQUE(chapter_id, revision)
      );

      CREATE INDEX IF NOT EXISTS idx_books_updated ON books(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_chapters_book ON chapters(book_id, sort_order ASC);
      CREATE INDEX IF NOT EXISTS idx_chapter_revisions ON chapter_revisions(chapter_id, revision DESC);
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

  private uniqueBookSlug(desired: string, excludeId?: string): string {
    let slug = slugify(desired);
    let n = 2;
    for (;;) {
      const row = this.db
        .prepare(`SELECT id FROM books WHERE slug = ?`)
        .get(slug) as { id: string } | undefined;
      if (!row || row.id === excludeId) return slug;
      slug = `${slugify(desired)}-${n++}`;
    }
  }

  private uniqueChapterSlug(
    bookId: string,
    desired: string,
    excludeId?: string,
  ): string {
    let slug = slugify(desired);
    let n = 2;
    for (;;) {
      const row = this.db
        .prepare(`SELECT id FROM chapters WHERE book_id = ? AND slug = ?`)
        .get(bookId, slug) as { id: string } | undefined;
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
    const blocks = ensureBlockIds(
      input.blocks && input.blocks.length > 0
        ? input.blocks
        : markdownToBlocks(input.bodyMarkdown || ""),
    );
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

  listBooks(limit = 50): BookRecord[] {
    return this.db
      .prepare(`SELECT * FROM books ORDER BY updated_at DESC LIMIT ?`)
      .all(limit) as BookRecord[];
  }

  getBook(idOrSlug: string): BookRecord | undefined {
    return this.db
      .prepare(`SELECT * FROM books WHERE id = ? OR slug = ?`)
      .get(idOrSlug, idOrSlug) as BookRecord | undefined;
  }

  listChapters(bookId: string): ChapterRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM chapters WHERE book_id = ? ORDER BY sort_order ASC, created_at ASC`,
      )
      .all(bookId) as ChapterRecord[];
  }

  getChapter(idOrSlug: string, bookId?: string): ChapterRecord | undefined {
    if (bookId) {
      return this.db
        .prepare(
          `SELECT * FROM chapters WHERE book_id = ? AND (id = ? OR slug = ?)`,
        )
        .get(bookId, idOrSlug, idOrSlug) as ChapterRecord | undefined;
    }
    return this.db
      .prepare(`SELECT * FROM chapters WHERE id = ? OR slug = ?`)
      .get(idOrSlug, idOrSlug) as ChapterRecord | undefined;
  }

  upsertBook(input: BookInput): BookRecord {
    const ts = nowIso();
    const title = input.title?.trim();
    if (!title) throw new Error("Book title is required");
    const overviewBlocks = ensureBlockIds(
      input.overviewBlocks?.length
        ? input.overviewBlocks
        : markdownToBlocks(input.overviewMarkdown || ""),
    );
    const overviewMarkdown =
      input.overviewMarkdown?.trim() ||
      (overviewBlocks.length ? blocksToMarkdown(overviewBlocks) : "");
    const meta = input.meta ?? {};
    const status = input.status ?? "published";
    const existing = input.id ? this.getBook(input.id) : undefined;

    const run = this.db.transaction(() => {
      if (existing) {
        const slug = this.uniqueBookSlug(input.slug || existing.slug, existing.id);
        this.db
          .prepare(
            `UPDATE books SET
              slug = ?, title = ?, synopsis = ?, overview_markdown = ?, overview_blocks_json = ?,
              audience = ?, tone = ?, format = ?, length = ?, theme = ?, goal = ?,
              status = ?, revision = revision + 1, updated_at = ?,
              published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
             WHERE id = ?`,
          )
          .run(
            slug,
            title,
            input.synopsis ?? existing.synopsis,
            overviewMarkdown,
            JSON.stringify(overviewBlocks),
            meta.audience ?? existing.audience,
            meta.tone ?? existing.tone,
            meta.format ?? existing.format,
            meta.length ?? existing.length,
            meta.theme ?? existing.theme,
            meta.goal ?? existing.goal,
            status,
            ts,
            status,
            ts,
            existing.id,
          );
        return this.getBook(existing.id)!;
      }

      const id = randomUUID();
      const slug = this.uniqueBookSlug(input.slug || title);
      this.db
        .prepare(
          `INSERT INTO books (
            id, slug, title, synopsis, overview_markdown, overview_blocks_json,
            audience, tone, format, length, theme, goal,
            status, revision, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          slug,
          title,
          input.synopsis ?? null,
          overviewMarkdown,
          JSON.stringify(overviewBlocks),
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
      return this.getBook(id)!;
    });

    return run();
  }

  publishChapter(input: ChapterInput): ChapterRecord {
    const ts = nowIso();
    const book = this.getBook(input.bookId);
    if (!book) throw new Error("Book not found");

    const blocks = ensureBlockIds(
      input.blocks && input.blocks.length > 0
        ? input.blocks
        : markdownToBlocks(input.bodyMarkdown || ""),
    );
    const bodyMarkdown =
      input.bodyMarkdown?.trim() || blocksToMarkdown(blocks);
    if (!bodyMarkdown.trim()) throw new Error("Chapter body is required");

    const title =
      input.title?.trim() || titleFromMarkdown(bodyMarkdown) || "Untitled chapter";
    const blocksJson = JSON.stringify(blocks);
    const bodyHtml = input.bodyHtml ?? null;
    const status = input.status ?? "published";
    const meta = input.meta ?? {};
    const existing = input.id ? this.getChapter(input.id) : undefined;

    const run = this.db.transaction(() => {
      if (existing) {
        if (existing.book_id !== book.id) {
          throw new Error("Chapter does not belong to this book");
        }
        const nextRev = existing.revision + 1;
        const slug = this.uniqueChapterSlug(
          book.id,
          input.slug || existing.slug,
          existing.id,
        );
        const sortOrder = input.sortOrder ?? existing.sort_order;
        this.db
          .prepare(
            `UPDATE chapters SET
              slug = ?, title = ?, sort_order = ?, body_markdown = ?, body_html = ?, blocks_json = ?,
              brief = ?, audience = ?, tone = ?, format = ?, length = ?, theme = ?, goal = ?,
              status = ?, revision = ?, updated_at = ?,
              published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
             WHERE id = ?`,
          )
          .run(
            slug,
            title,
            sortOrder,
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
            `INSERT INTO chapter_revisions
              (chapter_id, revision, title, body_markdown, body_html, blocks_json, change_summary, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            existing.id,
            nextRev,
            title,
            bodyMarkdown,
            bodyHtml,
            blocksJson,
            input.changeSummary ?? "Chapter edit saved",
            ts,
          );
        this.db
          .prepare(`UPDATE books SET updated_at = ?, revision = revision + 1 WHERE id = ?`)
          .run(ts, book.id);
        return this.getChapter(existing.id)!;
      }

      const maxOrder = (
        this.db
          .prepare(
            `SELECT COALESCE(MAX(sort_order), -1) AS m FROM chapters WHERE book_id = ?`,
          )
          .get(book.id) as { m: number }
      ).m;
      const sortOrder = input.sortOrder ?? maxOrder + 1;
      const id = randomUUID();
      const slug = this.uniqueChapterSlug(book.id, input.slug || title);
      this.db
        .prepare(
          `INSERT INTO chapters (
            id, book_id, slug, title, sort_order, body_markdown, body_html, blocks_json,
            brief, audience, tone, format, length, theme, goal,
            status, revision, created_at, updated_at, published_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        )
        .run(
          id,
          book.id,
          slug,
          title,
          sortOrder,
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
          `INSERT INTO chapter_revisions
            (chapter_id, revision, title, body_markdown, body_html, blocks_json, change_summary, created_at)
           VALUES (?, 1, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          title,
          bodyMarkdown,
          bodyHtml,
          blocksJson,
          input.changeSummary ?? "Initial chapter publish",
          ts,
        );
      this.db
        .prepare(`UPDATE books SET updated_at = ?, revision = revision + 1 WHERE id = ?`)
        .run(ts, book.id);
      return this.getChapter(id)!;
    });

    return run();
  }

  chapterHistory(chapterId: string): ChapterRevisionRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM chapter_revisions WHERE chapter_id = ? ORDER BY revision DESC`,
      )
      .all(chapterId) as ChapterRevisionRecord[];
  }

  getChapterRevision(
    chapterId: string,
    revision: number,
  ): ChapterRevisionRecord | undefined {
    return this.db
      .prepare(
        `SELECT * FROM chapter_revisions WHERE chapter_id = ? AND revision = ?`,
      )
      .get(chapterId, revision) as ChapterRevisionRecord | undefined;
  }

  applyChapterBlockUpdates(
    chapterId: string,
    updates: Block[],
    selectedIds?: Array<string | number>,
    changeSummary = "Selective block update",
  ): ChapterRecord {
    const chapter = this.getChapter(chapterId);
    if (!chapter) throw new Error("Chapter not found");
    let current: Block[] = [];
    try {
      current = JSON.parse(chapter.blocks_json) as Block[];
    } catch {
      current = markdownToBlocks(chapter.body_markdown);
    }
    current = ensureBlockIds(current);
    const merged = mergeBlocksById(current, ensureBlockIds(updates), selectedIds);
    return this.publishChapter({
      id: chapter.id,
      bookId: chapter.book_id,
      title: chapter.title,
      slug: chapter.slug,
      sortOrder: chapter.sort_order,
      blocks: merged,
      bodyMarkdown: blocksToMarkdown(merged),
      changeSummary,
      status: (chapter.status as "draft" | "published") || "published",
      meta: {
        brief: chapter.brief ?? undefined,
        audience: chapter.audience ?? undefined,
        tone: chapter.tone ?? undefined,
        format: chapter.format ?? undefined,
        length: chapter.length ?? undefined,
        theme: chapter.theme ?? undefined,
        goal: chapter.goal ?? undefined,
      },
    });
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
