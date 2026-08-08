# AGENTS.md

This file initializes repository knowledge for future coding agents.
Read this first before making edits.

## Project Snapshot

- Name: `writing-agent` (Quill Studio)
- Stack:
  - Backend: Node.js + TypeScript + Fastify
  - Frontend: Vanilla JS + HTML + CSS
  - Persistence: SQLite (`better-sqlite3`)
  - Validation: Zod
  - Orchestration: Cursor Cloud Agents API
  - Brief suggestions: Gemini API
- Runtime mode:
  - Cloud mode when `CURSOR_API_KEY` is set
  - Mock mode when key is missing

## Repository Layout

- `src/`
  - `server.ts`: API routes, run lifecycle, SSE, startup checks
  - `orchestrator.ts`: agent graph execution (`plan -> research -> write -> manage`)
  - `suggest-brief.ts`: brief suggestion prompt/model logic
  - `db.ts`: SQLite schema + CRUD + run/event persistence
  - `types.ts`: shared schemas and TS types
  - `config.ts`: config loading and env interpolation/coercion
  - `cursor-client.ts`: Cursor API client (`/v1/agents`, `/v1/models`)
  - `quarto.ts`, `themes.ts`, `article-pages.ts`, `book-pages.ts`: rendering helpers
- `public/`
  - `studio.html`: main studio shell
  - `app.js`: UI state, interactions, suggestion flow, pipeline views
  - `styles.css`, `tokens.css`: styling
  - `index.html`, `article.html`: public pages
- `config/agents.yaml`: primary workflow + model config
- `tests/`: node test suite (`tsx --test`)
- `dist/`: build output (generated)
- `design/`: design references/prototypes (not core runtime path)

## Core Product Features

- Book/chapter and article authoring in Studio
- Multi-agent writing pipeline with iterative manager gating
- Pipeline run and event persistence in DB
- Resume support for interrupted runs
- Background chapter runs and draft checkpoint persistence
- Brief suggestion generation via Gemini fast model path and chapter context
- Public published pages for books/articles/chapters

## Development Commands

- Install: `npm install`
- Dev server: `npm run dev`
- Type check: `npm run typecheck`
- Tests: `npm test`
- Build: `npm run build`
- Start built app: `npm start`

Always run at least:

1. `npm run typecheck`
2. `npm test`

before claiming task completion.

## Coding Style and Working Conventions

- Prefer small, targeted edits over broad rewrites.
- Keep code paths explicit and observable (especially run lifecycle and persistence).
- Follow existing naming and structure patterns in touched files.
- Keep user-facing logs concise and actionable.
- For async flows:
  - handle aborts
  - avoid swallowing errors silently
  - preserve persisted state consistency
- For suggestions/pipeline behavior, prefer deterministic guardrails over implicit UI assumptions.
- Do not introduce unrelated refactors during bug fixes.

## Data and Persistence Notes

- Local dev can use remote data API defaults depending on environment logic.
- Production on Railway uses durable SQLite at `/data/quill.db`.
- Pipeline progress must remain recoverable after refresh/restart.

## Deployment Notes (Railway)

- Service: `writing-agent`
- Typical deploy flow:
  1. Confirm tests/typecheck pass
  2. `railway status`
  3. `railway up -y --service writing-agent --environment production`
  4. Verify:
     - `railway deployment list --service writing-agent --environment production --json`
     - `curl https://writing-agent-production-b61f.up.railway.app/api/health`
- If model-related runtime issues appear, inspect startup logs for suggest model validation and `/v1/models` compatibility.

## Mandatory Handoff Rule

Every change must be recorded in `agents/changelog.md` before finishing work.

Minimum changelog entry must include:

- date/time
- summary of changes
- files touched
- validation steps run
- deployment status (if deployed)

