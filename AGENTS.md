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

## Cursor Cloud specific instructions

Standard commands live in "Development Commands" above (`npm install`, `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`, `npm start`). The update script already runs `npm install` on startup. Non-obvious caveats:

- Mock mode: with no `CURSOR_API_KEY`, the app runs fully offline in mock mode. The whole pipeline (`plan -> research -> write -> manage`) executes and returns a generated draft with zero external calls, so it is safe to test locally without any secrets. Set `CURSOR_API_KEY` (and `GEMINI_API_KEY` for live brief suggestions) in `.env` only when you need live provider calls.
- `.env` is required to start dev: `npm run dev` runs `tsx watch --env-file=.env ...`, which errors if `.env` is missing. `.env` is gitignored, so the update script recreates it from `.env.example` when absent. `npm start` (built app) does not require `.env`.
- Persistence gotcha — local dev proxies to PRODUCTION by default: with no Railway env vars, `remoteData` is `true` and `dataApiBase` points at the production Railway URL, so Publish/Save of books/chapters/articles writes to production. Generating/previewing a draft via the pipeline does NOT persist and is safe. To persist fully locally instead, set `RAILWAY_ENVIRONMENT=local` (makes `remoteData:false`, same-origin SQLite) plus optionally `QUILL_DB_PATH=./data/quill-local.db`. Avoid clicking Publish/Save during local testing unless you intend to hit prod.
- Server binds `0.0.0.0` on `PORT` (default `8080`). Verify liveness/mode via `GET /api/health`; core pipeline is `POST /api/run` (SSE stream). There is no separate lint step — `npm run typecheck` is the type/lint gate.

## Mandatory Handoff Rule

Every change must be recorded in `agents/changelog.md` before finishing work.

Minimum changelog entry must include:

- date/time
- summary of changes
- files touched
- validation steps run
- deployment status (if deployed)

