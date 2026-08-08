# Quill Design Options — Explore (Aug 2026)

Generated via Open Design (`frontend-design` + Cursor Agent).  
Shared brief: **easy book navigation · clean dashboard · clear write options · bottom agent-status panel**.

## Live direction

**Option C — Library Dashboard** is wired into the live Studio (`public/studio.html`, `public/styles.css`, `public/tokens.css`, `public/app.js`).

- Mint accent `#18E299`, Inter + Geist Mono
- Dashboard-first library home → book write workspace (chapter nav + Brief | Draft)
- Bottom agent dock (collapsed status bar → expands on Fire) hosting pipeline, roster, stream, and scores
- Prototype reference: `option-c-library-dash.html`

## Explorations (reference)

### A — Manuscript Desk
- File: `option-a-manuscript-desk.html`
- Feel: calm editorial desk — Fraunces/Source Serif titles, teal ink `#0f766e`, soft paper surfaces
- Layout: left book tree · dashboard/write center · **bottom agent dock**
- OD project: `quill-option-a-manuscript-desk` · run `a48cd51a`

### B — Writing IDE
- File: `option-b-writing-ide.html`
- Feel: dense light craft IDE — Inter + JetBrains Mono, cyan `#0891b2`
- Layout: command bar · slim source list · Dashboard | Brief | Draft · collapsible bottom dock
- OD project: `quill-option-b-writing-ide` · run `bfa391fb`

### C — Library Dashboard (live)
- File: `option-c-library-dash.html`
- Feel: dashboard-first publishing home — mint accent `#18E299`, airy white
- Layout: hero “Your books” home · library rows · book workspace with chapter nav · **bottom agent panel**
- OD project: `quill-option-c-library-dash` · run `1725383c`

## How to view prototypes locally

```bash
npm run dev
# then open:
# http://localhost:8080/design/option-a-manuscript-desk.html
# http://localhost:8080/design/option-b-writing-ide.html
# http://localhost:8080/design/option-c-library-dash.html
# live studio:
# http://localhost:8080/studio.html
```

(If `/design` is not statically served, open the HTML files directly in a browser.)

## Earlier options (archived)

- `option-macos-native.html` — previous macOS window chrome studio direction
- `option-a-gitbook-mint.html` / `option-b-notion-warm.html` / `option-c-linear-dense.html` — prior GitBook suite
