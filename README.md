# Quill — YAML-driven writing agent (Cursor API)

Multi-agent writing pipeline: **plan → research → write → manager**, looping until quality criteria (correctness, helpfulness, clarity, images) pass. Every agent definition, model, goal threshold, and graph edge lives in [`config/agents.yaml`](config/agents.yaml). Runtime calls the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) (`POST /v1/agents`, no-repo agents).

## Quick start

```bash
cp .env.example .env
# set CURSOR_API_KEY=...   or leave unset for mock mode
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

SQLite path: `SQLITE_PATH` (default `./data/quill.db`; Railway uses `/data/quill.db` on a persistent volume).

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
