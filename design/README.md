# Quill Design Options — Explore (Aug 2026)

Generated via Open Design (`frontend-design` + Cursor Agent).  
Shared brief: **easy book navigation · clean dashboard · clear write options · bottom agent-status panel**.

## New explorations (pick one to implement)

### A — Manuscript Desk
- File: `option-a-manuscript-desk.html`
- Preview: [Open preview](http://127.0.0.1:7456/api/projects/quill-option-a-manuscript-desk/raw/index.html)
- Feel: calm editorial desk — Fraunces/Source Serif titles, teal ink `#0f766e`, soft paper surfaces
- Layout: left book tree · dashboard/write center · **bottom agent dock** (pipeline + roster + console + scores)
- Demo: *Reinforcement Learning* book with chapters
- OD project: `quill-option-a-manuscript-desk` · run `a48cd51a`

### B — Writing IDE
- File: `option-b-writing-ide.html`
- Preview: [Open preview](http://127.0.0.1:7456/api/projects/quill-option-b-writing-ide/raw/index.html)
- Feel: dense light craft IDE — Inter + JetBrains Mono, cyan `#0891b2`
- Layout: command bar · slim source list · Dashboard | Brief | Draft · **240px bottom dock** (Agents / Console / Scores), collapsible to status strip
- Keys: ⌘1/2/3 · ⌘K · ⌘↩ Fire · ⌘B toggle dock
- Demo: *Distributed Systems*
- OD project: `quill-option-b-writing-ide` · run `bfa391fb`

### C — Library Dashboard
- File: `option-c-library-dash.html`
- Preview: [Open preview](http://127.0.0.1:7456/api/projects/quill-option-c-library-dash/raw/index.html)
- Feel: dashboard-first publishing home — mint accent `#18E299`, airy white
- Layout: hero “Your books” home · library rows · book workspace with chapter nav · **bottom agent panel** (idle strip → expands on Fire)
- Demo: multi-book library + resume list
- OD project: `quill-option-c-library-dash` · run `1725383c`

## How to view locally (no OD daemon)

```bash
npm run dev
# then open:
# http://localhost:8080/design/option-a-manuscript-desk.html
# http://localhost:8080/design/option-b-writing-ide.html
# http://localhost:8080/design/option-c-library-dash.html
```

(If `/design` is not statically served, open the HTML files directly in a browser.)

## Earlier options (archived)

- `option-macos-native.html` — macOS window chrome (current live studio direction)
- `option-a-gitbook-mint.html` / `option-b-notion-warm.html` / `option-c-linear-dense.html` — prior GitBook suite

## Next step

Tell the agent which option to wire into `public/studio.html` + `styles.css` + `tokens.css` (preserving `#fire-btn`, `#stream-box`, `#agent-roster-grid`, etc.).
