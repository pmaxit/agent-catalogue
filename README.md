# Quill — YAML-driven writing agent (Cursor API)

Multi-agent writing pipeline: **plan → research → write → manager**, looping until strict user-perspective criteria pass (correctness, clarity, helpfulness, **code_output**, **visual_feedback**, **addictive**). Heuristic caps in `src/judge.ts` prevent soft passes. Every agent definition, model, goal threshold, and graph edge lives in [`config/agents.yaml`](config/agents.yaml). Runtime calls the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) (`POST /v1/agents`, no-repo agents).

## Quick start

```bash
cp .env.example .env
# set CURSOR_API_KEY=...   or leave unset for mock mode
# set GEMINI_API_KEY=...   for live brief suggestions
npm install
npm run dev
```

Open http://localhost:8080

Without `CURSOR_API_KEY`, the server runs in **mock mode** so you can exercise the graph and UI locally.

## Configuration

Edit `config/agents.yaml`:

| Section | Controls |
|---------|----------|
| `api` | Cursor base URL, key env name, auth (`basic`/`bearer`), timeouts, mock |
| `defaults` | Model, `session` (`per_step` \| `shared`), runtime |
| `goal.criteria` | Quality bar the manager must clear |
| `agents.*` | Names, modes, models, instruction templates |
| `workflow.nodes` | Graph: `next` edges and manager `routes` |

Templates support `{{var}}`, `{% if var %}…{% endif %}`, and `{% for c in criteria %}…{% endfor %}`.

Env interpolation: `${VAR}` and `${VAR:-default}`.

Suggestion tuning (fast brief generation):
- `api.suggest_key_env` (default `GEMINI_API_KEY`)
- `api.suggest_base_url` (default `https://generativelanguage.googleapis.com/v1beta`)
- `api.suggest_model` (default `gemini-flash-latest`)
- `api.suggest_timeout_ms` (default `30000`)
- env overrides: `GEMINI_API_KEY`, `GEMINI_SUGGEST_MODEL`, `QUILL_SUGGEST_TIMEOUT_MS`

## API

- `GET /api/health` — liveness + mode (+ sqlite stats)
- `GET /api/config` — sanitized config for the UI
- `POST /api/run` — SSE stream of pipeline events
- `GET /api/articles` — published articles
- `GET /api/articles/:id` — article with blocks (formatting preserved)
- `POST /api/articles` / `PUT /api/articles/:id` — publish or save edit (creates a revision)
- `GET /api/articles/:id/history` — revision list
- `GET /api/articles/:id/revisions/:rev` — full snapshot of a revision

Body for `/api/run`:

```json
{
  "brief": "…",
  "audience": "…",
  "tone": "…",
  "format": "…",
  "length": "…"
}
```

SQLite: on Railway, `SQLITE_PATH=/data/quill.db` (persistent volume). Locally Quill does **not** write `./data/quill.db` — the studio saves books/chapters/articles to the Railway app via `QUILL_DATA_API_BASE` (defaults to the production URL).

## Railway

```bash
railway init --name writing-agent
railway variable set CURSOR_API_KEY=cursor_... --service writing-agent
railway up --detach -m "deploy writing agent"
railway domain generate --service writing-agent
```

Or leave `CURSOR_API_KEY` unset to ship mock mode first.

## Graph

```
plan → research → write → manage ─┬─ revise → write (loop)
                                  └─ done → end
```

Manager JSON must include `scores`, `passed`, `route` (`revise`|`done`), and `feedback`. The orchestrator forces `revise` if any criterion is below its YAML threshold.
