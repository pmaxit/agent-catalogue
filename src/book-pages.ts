import type { Block, BookRecord, ChapterRecord } from "./db.js";
import { blocksToHtml } from "./article-pages.js";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(opts: {
  title: string;
  description?: string;
  body: string;
  canonicalPath: string;
}): string {
  const desc = escapeHtml(opts.description || opts.title);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(opts.title)} — Quill</title>
    <meta name="description" content="${desc}" />
    <link rel="canonical" href="${escapeHtml(opts.canonicalPath)}" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inconsolata:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/tokens.css" />
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body class="page-article page-book">
    <header class="article-masthead">
      <a class="brand" href="/">
        <span class="brand-mark sm" aria-hidden="true"></span>
        <span class="brand-name">Quill</span>
      </a>
      <nav aria-label="Book">
        <a href="/">Product</a>
        <a href="/studio.html">Studio</a>
        <a href="/books">Books</a>
        <a href="/articles">Articles</a>
        <a href="/studio.html" class="nav-cta">Write yours</a>
      </nav>
    </header>
    ${opts.body}
    <footer class="site-footer compact">
      <p class="footer-meta">Quill · books &amp; chapters · SQLite-backed</p>
    </footer>
  </body>
</html>`;
}

export function renderBooksIndex(books: BookRecord[]): string {
  const items = books.length
    ? books
        .map((b) => {
          const date = (b.published_at || b.updated_at || "").slice(0, 10);
          return `<a class="related-card" href="/books/${escapeHtml(b.slug)}">
            <div class="ph-img tiny"></div>
            <h3>${escapeHtml(b.title)}</h3>
            <p>/${escapeHtml(b.slug)} · ${escapeHtml(b.theme || "Book")}</p>
            <span class="related-date">${escapeHtml(date)}</span>
          </a>`;
        })
        .join("\n")
    : `<p class="deck">No books yet. Start one in the studio.</p>`;

  const body = `
    <main class="article" data-od-id="books-index">
      <header class="article-header">
        <p class="eyebrow">Library</p>
        <h1>Books</h1>
        <p class="deck">Each book has an overview at <code>/books/&lt;slug&gt;</code> and chapters at <code>/books/&lt;slug&gt;/&lt;chapter&gt;</code>.</p>
      </header>
      <section class="related" aria-label="Published books">
        <div class="related-grid">${items}</div>
      </section>
    </main>`;

  return layout({
    title: "Books",
    description: "Browse Quill books and chapters.",
    body,
    canonicalPath: "/books",
  });
}

export function renderBookPage(
  book: BookRecord,
  chapters: ChapterRecord[],
): string {
  const date = (book.published_at || book.updated_at || "").slice(0, 10);
  const theme = book.theme || "Book";
  const synopsis = book.synopsis?.trim() || book.overview_markdown.slice(0, 280);
  const toc = chapters.length
    ? chapters
        .map(
          (c, i) => `<li>
            <a href="/books/${escapeHtml(book.slug)}/${escapeHtml(c.slug)}">
              <span class="chapter-num">Ch. ${i + 1}</span>
              <span>${escapeHtml(c.title)}</span>
            </a>
          </li>`,
        )
        .join("\n")
    : `<li class="empty-toc">No chapters published yet.</li>`;

  let overviewHtml = "";
  if (book.overview_markdown.trim()) {
    try {
      const blocks = JSON.parse(book.overview_blocks_json) as Block[];
      overviewHtml = blocks.length
        ? blocksToHtml(blocks)
        : `<p>${escapeHtml(book.overview_markdown).replace(/\n\n/g, "</p><p>")}</p>`;
    } catch {
      overviewHtml = `<p>${escapeHtml(book.overview_markdown).replace(/\n\n/g, "</p><p>")}</p>`;
    }
  }

  const body = `
    <article class="article book-overview" data-od-id="book-body">
      <header class="article-header">
        <p class="eyebrow">${escapeHtml(theme)} · /books/${escapeHtml(book.slug)}</p>
        <h1>${escapeHtml(book.title)}</h1>
        ${synopsis ? `<p class="deck">${escapeHtml(synopsis).slice(0, 320)}</p>` : ""}
        <div class="byline">
          <span class="avatar" aria-hidden="true">Q</span>
          <div>
            <strong>Quill Studio</strong>
            <span>${chapters.length} chapter${chapters.length === 1 ? "" : "s"} · r${book.revision} · ${escapeHtml(date)}</span>
          </div>
        </div>
      </header>
      ${overviewHtml ? `<div class="prose">${overviewHtml}</div>` : ""}
      <section class="book-toc" aria-label="Table of contents">
        <h2>Chapters</h2>
        <ol class="chapter-toc">${toc}</ol>
      </section>
      <footer class="author-footer">
        <span class="avatar lg" aria-hidden="true">Q</span>
        <div>
          <strong>${escapeHtml(book.title)}</strong>
          <p>
            Permanent URL: <a href="/books/${escapeHtml(book.slug)}"><code>/books/${escapeHtml(book.slug)}</code></a>
            · <a href="/studio.html">Continue in studio</a>
          </p>
        </div>
      </footer>
    </article>`;

  return layout({
    title: book.title,
    description: (synopsis || book.title).slice(0, 160),
    body,
    canonicalPath: `/books/${book.slug}`,
  });
}

export function renderChapterPage(
  book: BookRecord,
  chapter: ChapterRecord,
  blocks: Block[],
  siblings: ChapterRecord[],
): string {
  const bodyHtml =
    blocks.length > 0
      ? blocksToHtml(blocks)
      : `<p>${escapeHtml(chapter.body_markdown).replace(/\n\n/g, "</p><p>")}</p>`;
  const date = (chapter.published_at || chapter.updated_at || "").slice(0, 10);
  const idx = siblings.findIndex((c) => c.id === chapter.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const deck =
    chapter.brief?.trim() ||
    chapter.body_markdown.split("\n").find((l) => l.trim() && !l.startsWith("#")) ||
    "";

  const body = `
    <article class="article book-chapter" data-od-id="chapter-body">
      <header class="article-header">
        <p class="eyebrow">
          <a href="/books/${escapeHtml(book.slug)}">${escapeHtml(book.title)}</a>
          · Ch. ${idx >= 0 ? idx + 1 : chapter.sort_order + 1}
          · /books/${escapeHtml(book.slug)}/${escapeHtml(chapter.slug)}
        </p>
        <h1>${escapeHtml(chapter.title)}</h1>
        ${deck ? `<p class="deck">${escapeHtml(deck).slice(0, 280)}</p>` : ""}
        <div class="byline">
          <span class="avatar" aria-hidden="true">Q</span>
          <div>
            <strong>${escapeHtml(book.title)}</strong>
            <span>r${chapter.revision} · ${escapeHtml(date)}</span>
          </div>
        </div>
      </header>
      <div class="prose" data-od-id="chapter-prose">
        ${bodyHtml}
      </div>
      <nav class="chapter-nav" aria-label="Chapter navigation">
        ${
          prev
            ? `<a class="chapter-nav-link prev" href="/books/${escapeHtml(book.slug)}/${escapeHtml(prev.slug)}">← ${escapeHtml(prev.title)}</a>`
            : `<span></span>`
        }
        <a class="chapter-nav-link toc" href="/books/${escapeHtml(book.slug)}">Book contents</a>
        ${
          next
            ? `<a class="chapter-nav-link next" href="/books/${escapeHtml(book.slug)}/${escapeHtml(next.slug)}">${escapeHtml(next.title)} →</a>`
            : `<span></span>`
        }
      </nav>
    </article>`;

  return layout({
    title: `${chapter.title} · ${book.title}`,
    description: deck.slice(0, 160),
    body,
    canonicalPath: `/books/${book.slug}/${chapter.slug}`,
  });
}

export function renderBookNotFound(path: string): string {
  return layout({
    title: "Book not found",
    body: `
      <main class="article">
        <header class="article-header">
          <p class="eyebrow">404</p>
          <h1>No book at ${escapeHtml(path)}</h1>
          <p class="deck">Browse the <a href="/books">books library</a> or open the <a href="/studio.html">studio</a>.</p>
        </header>
      </main>`,
    canonicalPath: path,
  });
}
