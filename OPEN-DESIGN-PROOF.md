# Quill GitBook Redesign — Functional Spec & Research

## Goals
- GitBook / Mintlify / Notion grade documentation UX for a multi-agent book writing pipeline
- Easy to enter: first-time empty states, smart defaults, progressive disclosure, not overwhelming forms
- Preserve all existing runtime capabilities but reorganize

## Current Core Functionalities (must retain, from src/server.ts + public/app.js)

### Data Model
- **Books**: id, slug, title, synopsis, overview_markdown, theme, goal, audience, tone, format, length, status, revision, chapters[]
- **Chapters**: id, book_id, slug, title, sort_order, body_markdown, blocks_json (Block {id,type,text,html}), brief, audience, tone, format, length, theme, goal, status, revision, history[]
- **Articles**: same as chapters standalone
- **Blocks**: h1/h2/h3/blockquote/paragraph/list/drawio/code/table, with id preserved for selective revise
- **Revisions**: full snapshot per publish

### Compose Flow (Brief Builder)
1. **Writing Goal** (O'Reilly-Style Technical Book Chapter, Thought Leadership, Technical Case Study, Product Launch, Executive Brief) -> sets planner focus
2. **Theme & Voice** (Agentic Command, Technical Trace, Editorial Signal, Narrative Pulse, Executive Crisp, O'Reilly Book Chapter) -> maps to tone/format/length defaults via data-tone/data-format/data-length attributes
3. **Brief & Params**: brief textarea (required), audience, tone, format, length inputs
4. **Judging Criteria**: checkboxes correctness, clarity, helpfulness, code_output, visual_feedback, addictive with thresholds 0.85+ etc, at least one required
5. **Quality Bar**: max_iterations, threshold display
6. **Fire agents CTA** -> POST /api/run SSE stream

### Pipeline Status / Orchestrator
- Config from config/agents.yaml: api, defaults.model, goal.criteria, agents (planner, researcher_facts, researcher_examples, researcher_visuals, writer, manager), workflow nodes entry plan research write manage end with parallel_agents fan-out
- Orchestrator events: pipeline_started, agents_roster [{nodeId,agentId,agentName,role,status}], agent_status {status detail running/queued/streaming/done/error}, node_started, agent_created (cursor id), assistant_delta (write streaming), node_finished {outputKey output evaluation}, route {from to reason}, pipeline_finished {status completed/max_iterations/error draft error}
- Visualization needed: pipeline map (stage nodes 01-04 with active/completed), iteration badge, agent roster cards with status dot pulsing, live log stream [time] TAG message, criteria cards pass/fail

### Draft Output & Editing
- **Raw draft rendering**: markdownToPreviewHtml -> supports #/##/###, blockquote > with Tip/Note/Warning callouts -> aside.qmd-callout, ul/ol, ```drawio mxfile -> iframe viewer.diagrams.net + editor link, ```lang code fences -> .qmd-code with language label, tables pipe syntax -> .qmd-table-wrap
- **Block editor**: parse blocks_json, render each block with controls (up/down/delete/edit, type switch), selectedBlockIds Set for revise, block-revise-bar (select all, instruction input, update selected), apply-panel (proposals list with checkboxes, apply selected/dismiss)
- **Save flows**: autosave after pipeline (chapterDirty), manual save -> POST /api/chapters or /api/articles or /api/books, saveStatus text Unsaved changes… / Saved
- **Publish**: publishBtn -> enablePublishMode -> blocksToMarkdown -> publish input status published
- **History**: loadHistory -> /api/articles/:id/history or chapters, show revisions list, load snapshot
- **Export**: downloadBtn -> POST /api/export/qmd -> Content-Disposition attachment, preview notebook -> POST /api/notebook/preview
- **Suggest brief**: GET bookTitle, chapterTitle etc -> POST /api/suggest-brief -> suggestion with accepted brief + rationale, banner UI with Accept/Dismiss, flash animation on fields

### Library / Navigation
- **Books list** /api/books -> render book-tree-item with row article-link-row active, expand chapters as ul.book-tree-chapters, public link ↗
- **Articles list** /api/articles -> similar
- **Book rail** (when book open): title, meta "X chapters", public link, add chapter btn, chapter list with active
- **Activity rail**: Lib, Write, Run icons, current activity state via rail-btn.active
- **Library tabs**: Books | Articles
- **New menu**: Book, Chapter (hidden until book open), Article dropdown
- **Topbar**: studio search filtering goals/themes/books/articles, health pill mock/live, status badges mode-badge model-badge

### KPIs / Config display
- agents count, max iters, threshold min, runtime mock/api -> from /api/config + /api/health
- updateBriefReadiness: ready of 3 (theme, brief, criteria)

## GitBook Inspiration Analysis

Mintlify.com (best match):
- White canvas, near-black #0d0d0d, green #18E299 accent sparingly
- Inter tight tracking -1.28px at 64px, Geist Mono uppercase 12px mono
- Borders rgba(0,0,0,0.05) 5% opacity primary separation, not shadows
- Full pill 9999px for buttons/inputs/badges, 16px cards, 24px featured
- Shadow rgba(0,0,0,0.03) 0 2px 4px subtle
- Hero gradient green-white atmospheric wash cloud-like
- Layout: sticky left nav 280px, center max 768px reading, right toc 220px, generous section padding 64-96px
- Easy entry: progressive disclosure, large textarea, pill chips, not heavy forms

GitBook.com:
- Similar docs tri-pane, left nav collapsible tree with expand carets, search cmd+k, breadcrumb, right toc auto-generated
- Cards with border + hover border darkening

Notion:
- Warm neutrals #f6f5f4, whisper borders rgba(0,0,0,0.1), multi-layer shadow sub 0.05 opacity
- NotionInter negative tracking -2.125px at 64px
- Database view for books, inline editable props

## New Design Requirements

### Information Architecture (GitBook-style)
```
+--------------------------------------------------------------------------------+
| Topbar: logo Quill | Search (cmd+k) | Books | Articles | (Book Title when open) | Status pill MOCK·Railway DB | Model
+--------------------------------------------------------------------------------+
| Left 280px | Center  ~720px reading | Right 320px pipeline |
| Library:   | Breadcrumb Home > Book > Ch3 | Pipeline: |
| - Search   | Title H1 64px tight | Stepper vertical |
| - Tabs Books/Articles | Synopsis | Agent roster |
| - +New btn | Tabs: Brief | Draft | Blocks | Live console |
| - Book tree: | Brief builder: | Criteria scores |
|   > Book Title (7 ch) | I. Goal chips pill | TOC (h2s) |
|     - Ch.1 Active | II. Theme 2-col cards | Draft actions |
|     - Ch.2 | III. Brief large textarea | Save, Publish, History |
|     - +Add chapter | Audience/Tone/Format/Length 2-col pill inputs | Export .qmd |
| - Footer badges | IV. Criteria cards checkbox | |
|            | Quality bar + Fire agents CTA primary black pill 9999px |
|            | Draft: Quarto notebook chrome, qmd-body with h1/h2/table/code/drawio |
+--------------------------------------------------------------------------------+
```

### Easy Entry Optimizations (vs current)
- Default goal = Thought Leadership, theme = Agentic Command pre-selected (active state)
- Brief textarea above fold, large 5 rows, placeholder example, readiness indicator green dot
- Goals as pill chips 9999px not large cards -> faster scan, one click
- Themes as compact cards with swatch + title + 1-line sub, 2-col grid, swatch visual 48px circle not rectangle
- Params row as inline pill inputs with floating label uppercase mono 11px tracking 0.08em
- Criteria as compact checkbox cards with threshold badge small, selected count "6 selected"
- +New flows prompt modal not window.prompt -> inline sheet
- Book creation prompts audience/tone inherit from book
- AI suggestion banner appears below brief spec strip with Accept/Dismiss primary green
- Fire agents btn sticky bottom right on mobile, shows keyboard shortcut Enter
- Empty states: No books -> illustration + CTA "Create your first book"

### Status Visibility (right rail always visible on desktop >1280)
- Pipeline map vertical stepper with line connecting nodes, active pulsing green dot, completed check, pending muted
- Agent roster 2-col mini cards: name, role tiny, status label mono uppercase 11px, detail ellipsis
- Live stream collapsible: header with live dot pulsing #18E299, mono stamp Idle/Active, 12px log entries grid 78px tag 72px msg
- Criteria score grid 3-col at top of draft panel: label 11px mono muted, score 0.85 pass green #0FA76E fail red
- Draft canvas with block editor controls on hover only, not always visible

### Multi-Variant Plan
- Option A (Mint, Recommended): implementation target, green #18E299 accent, Inter, white, 5% borders, 9999px pills, docs-grade whitespace
- Option B (Notion Warm): warm #f6f5f4 alternation, NotionInter, 12px cards, whisper borders, database style book list with icons, inline editing
- Option C (Shadcn/Linear): monochrome #000 primary, dense, command palette cmd+k header, KPI cards top, split console+draft, minimalist

### Technical Preservation
- Keep all element IDs for app.js compatibility: books-list, articles-list, book-rail, book-rail-title, book-rail-meta, book-chapter-list, book-public-link, book-add-chapter-btn, goals-selector, themes-selector, agent-form, brief-input, audience-input, tone-input, format-input, length-input, fire-btn, reset-btn, wizard-section, workspace-section, workspace-grid, console-panel, stream-box, stream-status, live-dot, article-canvas, criteria-card-grid, iteration-badge, published-badge, publish-btn, save-btn, history-btn, etc
- But restructure DOM to GitBook 3-col while keeping IDs
- New tokens.css must still define --bg --surface --fg --fg-2 --muted --meta --border --border-soft --accent --accent-on --accent-hover --success --warn --danger --font-display --font-body --font-mono + new --brand #18E299

## Next Implementation Steps
1. Tokens: mintlify mapping
2. Styles: complete rewrite styles.css tri-pane, Mintlify specific, preserve functionality classes
3. studio.html: rewrite to gitbook structure but preserve JS hooks
4. index.html: rewrite to Mintlify hero + features + pipeline explanation + CTA
5. design-options.html: tabs for A/B/C comparison with iframes or screenshots
6. Test dev server
7. Integrate Open Design output when runs succeed
