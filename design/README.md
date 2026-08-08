# Quill Design Options — Saved from Open Design

Generated via Open Design (`frontend-design` skill + design systems).

## Files

- `option-macos-native.html` — 59kb, **macOS native app (newest)**
  - Source: project `quill-macos-redesign`, run `8eca855e-0994-41bb-b905-5b2aef46dce8`, preview `http://127.0.0.1:7456/api/projects/quill-macos-redesign/raw/index.html`
  - Design system: Apple + Apple HIG macOS patterns; agent: cursor-agent
  - Tokens: SF Pro system stack, system blue `#007AFF`, surfaces `#fff` / `#f5f5f7`, hairlines `#d2d2d7`, 6–8px radii, light mode only
  - Layout: fake Mac window (traffic lights, frosted toolbar, desktop wallpaper) · sidebar ~240 source list with disclosure triangles · center segmented Brief | Pipeline | Draft · inspector ~280 stepper / agents / console / scores
  - Interactions: ⌘K Spotlight palette, ⌘1/2/3 segments, expand/collapse books, Fire Agents pipeline animation, empty state, draft with callout/code/table/diagram
  - Integration IDs preserved for app.js wiring

- `option-a-gitbook-mint.html` — 58kb, **Earlier GitBook option**
  - Source: project `quill-gitbook-redesign-cbe6`, run `104086d8-1cd1-4db4-9f89-77ed68b2b851`, preview `http://127.0.0.1:7456/api/projects/quill-gitbook-redesign-cbe6/raw/index.html`
  - Tokens: bg #fff, fg #0d0d0d, border rgba(0,0,0,0.05) 5%, brand #18E299 green sparingly, Inter tight -1.28px at 64px / -0.8px at 40px, Geist Mono 11px uppercase, 16px cards, 9999px pills, shadow 0.03 opacity.
  - Layout: tri-pane 280px left (search ⌘K, Books/Articles pill tabs, book tree Ch.1-5 expandable, +New), center 840px max (breadcrumb, I Goal 5 pill chips Thought Leadership active, II Theme 6 cards 2-col swatch, III Brief large textarea readiness 2/3 + 4 pill inputs audience/tone/format/length + loops threshold, IV Criteria 6 cards), right 340px (vertical stepper 01 Planner done 02 Research ×3 active 03/04 queued Loop badge, agent roster pulsing green dot, live console #stream-box mono 12px [00:00:00] TAG, criteria scores, draft Quarto notebook #article-canvas with h1 blockquote code+output draw.io placeholder table).
  - Multi-tab: top variant tabs A/B/C switching data-variant, localStorage persisted, responsive <1180px right drawer, <900px stacked.

- `option-b-notion-warm.html` — 54kb, **Conceptual**
  - Project `quill-gitbook-option-b-notion-492c`, run `cd7b4d23`, preview `http://127.0.0.1:7456/api/projects/quill-gitbook-option-b-notion-492c/raw/index.html`
  - Tokens: bg #f6f5f4 warm, fg rgba(0,0,0,0.95) warm near-black #11100f, secondary #615d59, border rgba(17,16,15,0.06) whisper, NotionInter, blue #0075de CTA, pill badges #f2f9ff, 10px radius, shadow multi-layer sub 0.05 opacity, warm alternation white/f6f5f4.
  - Layout: database view for books (cover icon 36px, synopsis clamp, blue status), inline properties as pill inputs, brief large textarea raised card, Notion blocks drag handle ⋮⋮ hover, toggle blocks research trace, right pipeline warm dots.

- `option-c-linear-dense.html` — 41kb, **Power user**
  - Project `quill-gitbook-option-c-linear-685d`, run `19bf9a38`, preview `http://127.0.0.1:7456/api/projects/quill-gitbook-option-c-linear-685d/raw/index.html`
  - Tokens: bg #fff, fg #111827, primary #000 CTA, Fira Code + Inter, radius 8px cards, 9999px pills badges only, dense type 12/14/16/20/24/32, no heavy shadows.
  - Layout: command bar cmd+K → Fire agents / Search books / Toggle console, KPI row 4 monochrome AGENTS 4 LOOPS 6 THRESH 0.75 DB Railway, left 280px minimal list / to filter, center split 380px console mono 11.5px SSE + draft dense 65ch, right 288px vertical pipeline compact, cmd-K palette overlay, ⌘↩ fire, / filter.

## Implementation in codebase

- `public/tokens.css` → **macOS tokens** (SF Pro system stack, system blue `#007AFF`, `#f5f5f7` surfaces, hairline `#d2d2d7`)
- `public/styles.css` → **macOS window shell** (traffic lights, frosted toolbar, source-list sidebar, inspector, segmented Brief/Pipeline/Draft)
- `public/studio.html` → Live macOS studio wired to `/app.js` (IDs preserved; ⌘K palette; ⌘1/2/3)
- `public/index.html` → Landing (inherits macOS tokens)
- `design/option-macos-native.html` → OD prototype source of truth for the redesign

## How to view

```bash
npm run dev
# http://localhost:8080/studio.html                          # live macOS studio (hooked to /api/run)
# http://localhost:8080/design/option-macos-native.html      # OD prototype (if served from /design)
# http://127.0.0.1:7456/api/projects/quill-macos-redesign/raw/index.html  # OD live preview
```

Latest direction: **macOS native** (SF Pro, system blue, 3-pane window chrome).
