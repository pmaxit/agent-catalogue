import type { ArticleRecord, Block } from "./db.js";
import { renderDrawioEmbed } from "./diagrams.js";
import { markdownTableToHtml } from "./quarto.js";

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

export function blocksToHtml(blocks: Block[]): string {
  return blocks
    .map((b, index) => {
      const text = b.text ?? "";
      switch (b.type) {
        case "h1":
          return `<h1>${inlineFormat(text)}</h1>`;
        case "h2":
          return `<h2>${inlineFormat(text)}</h2>`;
        case "h3":
          return `<h3>${inlineFormat(text)}</h3>`;
        case "blockquote":
          return `<blockquote>${text
            .split("\n")
            .map((line) => `<p>${inlineFormat(line)}</p>`)
            .join("")}</blockquote>`;
        case "list":
          return `<ul>${text
            .split("\n")
            .filter(Boolean)
            .map((line) => `<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`)
            .join("")}</ul>`;
        case "drawio":
          return renderDrawioEmbed(text, {
            title: `Workflow diagram ${index + 1}`,
            index,
          });
        case "code": {
          const nl = text.indexOf("\n");
          const lang = nl >= 0 ? text.slice(0, nl).trim() : "";
          const body = nl >= 0 ? text.slice(nl + 1) : text;
          const cls = lang ? ` class="language-${escapeHtml(lang)}"` : "";
          const label = lang
            ? `<div class="qmd-code-label">${escapeHtml(lang)}</div>`
            : "";
          return `<div class="qmd-code">${label}<pre><code${cls}>${escapeHtml(body)}</code></pre></div>`;
        }
        case "table":
          return markdownTableToHtml(text);
        default:
          return `<p>${inlineFormat(text).replace(/\n/g, "<br />")}</p>`;
      }
    })
    .join("\n");
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
  <body class="page-article">
    <header class="article-masthead">
      <a class="brand" href="/">
        <span class="brand-mark sm" aria-hidden="true"></span>
        <span class="brand-name">Quill</span>
      </a>
      <nav aria-label="Article">
        <a href="/">Product</a>
        <a href="/studio.html">Studio</a>
        <a href="/books">Books</a>
        <a href="/articles">Articles</a>
        <a href="/studio.html" class="nav-cta">Write yours</a>
      </nav>
    </header>
    ${opts.body}
    <footer class="site-footer compact">
      <p class="footer-meta">Quill · published articles · SQLite-backed</p>
    </footer>
  </body>
</html>`;
}

export function renderArticlesIndex(
  articles: ArticleRecord[],
): string {
  const items = articles.length
    ? articles
        .map((a) => {
          const date = (a.published_at || a.updated_at || "").slice(0, 10);
          return `<a class="related-card" href="/articles/${escapeHtml(a.slug)}">
            <div class="ph-img tiny"></div>
            <h3>${escapeHtml(a.title)}</h3>
            <p>/${escapeHtml(a.slug)} · revision ${a.revision}</p>
            <span class="related-date">${escapeHtml(date)}</span>
          </a>`;
        })
        .join("\n")
    : `<p class="deck">No published articles yet. Open the studio to publish one.</p>`;

  const body = `
    <main class="article" data-od-id="articles-index">
      <header class="article-header">
        <p class="eyebrow">Library</p>
        <h1>Published articles</h1>
        <p class="deck">Every published piece has its own slug URL under <code>/articles/&lt;slug&gt;</code>.</p>
      </header>
      <section class="related" aria-label="Published articles">
        <div class="related-grid">${items}</div>
      </section>
    </main>`;

  return layout({
    title: "Published articles",
    description: "Browse all Quill articles published to SQLite.",
    body,
    canonicalPath: "/articles",
  });
}

export function renderArticlePage(
  article: ArticleRecord,
  blocks: Block[],
): string {
  const bodyHtml =
    blocks.length > 0
      ? blocksToHtml(blocks)
      : `<p>${escapeHtml(article.body_markdown).replace(/\n\n/g, "</p><p>")}</p>`;
  const date = (article.published_at || article.updated_at || "").slice(0, 10);
  const theme = article.theme || "Published";
  const deck =
    article.brief?.trim() ||
    article.body_markdown.split("\n").find((l) => l.trim() && !l.startsWith("#")) ||
    "";

  const body = `
    <article class="article" data-od-id="article-body">
      <header class="article-header" data-od-id="article-headline">
        <p class="eyebrow">${escapeHtml(theme)} · /articles/${escapeHtml(article.slug)}</p>
        <h1>${escapeHtml(article.title)}</h1>
        ${deck ? `<p class="deck">${escapeHtml(deck).slice(0, 280)}</p>` : ""}
        <div class="byline">
          <span class="avatar" aria-hidden="true">Q</span>
          <div>
            <strong>Quill Studio</strong>
            <span>r${article.revision} · ${escapeHtml(date)}</span>
          </div>
        </div>
      </header>
      <div class="prose" data-od-id="article-prose">
        ${bodyHtml}
      </div>
      <footer class="author-footer">
        <span class="avatar lg" aria-hidden="true">Q</span>
        <div>
          <strong>${escapeHtml(article.title)}</strong>
          <p>
            Permanent URL: <a href="/articles/${escapeHtml(article.slug)}"><code>/articles/${escapeHtml(article.slug)}</code></a>
            · <a href="/studio.html">Edit in studio</a>
          </p>
        </div>
      </footer>
    </article>`;

  return layout({
    title: article.title,
    description: deck.slice(0, 160),
    body,
    canonicalPath: `/articles/${article.slug}`,
  });
}

export function renderNotFound(slug: string): string {
  return layout({
    title: "Article not found",
    body: `
      <main class="article">
        <header class="article-header">
          <p class="eyebrow">404</p>
          <h1>No article at /articles/${escapeHtml(slug)}</h1>
          <p class="deck">It may be unpublished or the slug changed. Browse the <a href="/articles">library</a> or open the <a href="/studio.html">studio</a>.</p>
        </header>
      </main>`,
    canonicalPath: `/articles/${slug}`,
  });
}
