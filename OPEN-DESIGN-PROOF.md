# Open Design — proof of use

This file documents that the Quill website revamp was produced via the
[open-design](https://github.com/sugarforever/open-design-skill) skill workflow
against the [Open Design](https://github.com/nexu-io/open-design) catalogue.

## Phase evidence

| Phase | Action | Proof |
|---|---|---|
| 1 · Setup | Cloned OD catalogue | `$OPEN_DESIGN_ROOT` → `~/.open-design-skill/repo` |
| 2 · Unbind | Deleted prior bind (atelier-zero) | User chose **B** (re-pick) |
| 2 · Intent | Prototype / landing / page | Website revamp |
| 2 · Mood | AI / developer | User chose **4** |
| 2 · Templates | dashboard + saas-landing + blog-post | User chose **1,2,3** |
| 2 · Design system | `agentic` (initial) | User chose **4** |
| 2 · Bind | Wrote project bind file | [`.open-design.json`](./.open-design.json) |
| 3 · Compose | Loaded DESIGN.md + tokens + craft + template SKILLs | Paths below |
| 3 · Execute | Wrote three surfaces into `public/` | Files below |
| 2 · Rebind | User rejected dark theme → white / WordPress-inspired | Switched to `webflow` (no `wordpress` slug in catalogue) |

## Binding (current)

```json
{
  "version": 1,
  "designSystem": {
    "slug": "webflow",
    "path": "design-systems/webflow"
  },
  "skill": {
    "slug": "dashboard",
    "path": "design-templates/dashboard",
    "kind": "design-template",
    "mode": "prototype"
  },
  "extras": {
    "siblingTemplates": ["saas-landing", "blog-post"],
    "note": "webflow = white canvas + blue accent; WordPress-inspired admin chrome (#f0f0f1 / #f6f7f7)"
  }
}
```

Primary skill bind is **dashboard** (studio). Sibling templates **saas-landing**
and **blog-post** were applied under the same design system as additional pages.

## Bodies loaded from `$OPEN_DESIGN_ROOT`

### Initial bind (`agentic`)
- `design-systems/agentic/DESIGN.md` + `tokens.css` + craft

### Current bind (`webflow`) — light / WordPress-inspired
- `design-systems/webflow/DESIGN.md`
- `design-systems/webflow/USAGE.md`
- `design-systems/webflow/tokens.css` → copied to `public/tokens.css`
- Same templates: dashboard, saas-landing, blog-post

## Token authority (current)

- White canvas `#ffffff`, near-black ink `#080808`
- Accent Webflow Blue `#146ef5` (WordPress-adjacent blue CTA)
- Studio chrome uses WP-admin greys `#f0f0f1` / `#f6f7f7` for shell + sidebar
- Fonts: Inter + Inconsolata (Webflow package fallbacks for WF Visual Sans)

## Artifacts shipped

| Surface | Template | Path |
|---|---|---|
| Marketing landing | saas-landing | `public/index.html` |
| Writing studio | dashboard | `public/studio.html` + `public/app.js` |
| Sample article | blog-post | `public/article.html` |
| Shared tokens | webflow | `public/tokens.css` |
| Shared chrome | — | `public/styles.css` |

## Craft self-check (summary)

- [x] Colors resolve through webflow tokens (`var(--*)`), not invented indigo
- [x] No emoji feature icons (SVG monoline instead)
- [x] `data-od-id` on major regions for comment-mode compatibility
- [x] Light theme throughout (no dark command surfaces)
- [x] Accent used sparingly (CTAs, active nav, pull-quote rule, live indicators)

## How to verify locally

```bash
npm run dev
# open http://localhost:8080/          → landing (saas-landing)
# open http://localhost:8080/studio.html → studio (dashboard)
# open http://localhost:8080/article.html → sample (blog-post)
cat .open-design.json
test -f "$HOME/.open-design-skill/repo/design-systems/webflow/DESIGN.md" && echo "OD repo OK"
```

Bound at: see `boundAt` in `.open-design.json`.
