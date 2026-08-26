# Snorlax-Bot `/v1` protocol

Canonical contract: [openapi.yaml](openapi.yaml).

Clients (`SNORLAX_URL` + `SNORLAX_TOKEN`) talk only to the FastAPI runtime.
They never call oMLX or vLLM, never call tools, never call MCP, and never read
`~/.snorlax-bot/` on the host. Additive `GET /v1/agents/{id}/workspace`
reads are served by the runtime from that sandbox. Channel workspaces are
sandboxes under that data dir, not a picker for a folder on the Mac.
MCP config (`mcp.json`) stays on the runtime host.

v0.8 question widgets: Message `kind=widget` plus `widget`,
`widgetStatus`, and `widgetValues` on that row. Answer with
`{ widgetReply: { id, values?, dismissed? } }`. No `widget.*` SSE event.
Clients render only.

v0.9 skills and cron routines: SKILL.md from
`SNORLAX_DATA_DIR/skills/<slug>/SKILL.md`. `GET /v1/agents/{id}/routines`
lists `{ id, name, skill, schedule, enabled }` (404 missing; 409 channel).
Pause/enable is `PATCH .../routines/{rid}` `{ enabled }` (404 unknown;
409 channel). POST seeds for tests; 422 unknown skill / bad cron /
channel. No DELETE. A due cron writes a normal assistant Message in that
agent's 1:1 with optional `routineName`. Missed ticks are skipped.
Chrome is list + enable/pause only.

v0.10 MCP connect chrome: `GET /v1/plugins` `{ id, name, status:
connected|needsAuth }`. `POST /v1/plugins/{id}/auth` returns
`{ authorizationUrl }` for the OS browser; the OAuth callback hits the
runtime. Message `kind=connect` plus `connect` / `connectStatus`. Answer
with `{ connectReply: { id } }` or `{ dismissed: true }`. No `connect.*`
SSE event. No uninstall / store / Add-custom UI. Plugins list is Settings
only.

A copy is also kept at `runtime/openapi.yaml` and `desktop/openapi.yaml`
so those trees are self-contained. Do not let the files diverge.

iOS `/v1` Codable types are generated from this file:

```bash
python3 ios/scripts/generate_v1_types.py
```
