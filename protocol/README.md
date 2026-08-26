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
runtime (GET, or POST complete with code+state). Message `kind=connect`
plus `connect` / `connectStatus`. Answer with `{ connectReply: { id } }`
or `{ dismissed: true }`. `{ id }` emits `connect.url` then ends; dismiss
does not. No `connect.*` event on the card emit. No uninstall / store /
Add-custom UI. Plugins list is Settings only.

v0.11 assistant markdown: `Message.content` stays a string. Do not
add `contentType`, mime, html, or `blocks[]`. Runtime does not rewrite
assistant text to HTML or split one message into many. SSE
`message.delta` is still text chunks of that same string. User messages
stay plain text as stored. Clients render markdown. widget / connect /
tool / routine fields stay. No MCP mix-in.

v0.12 MCP Add custom: `POST /v1/plugins` `{ name, transport: "stdio" |
"url", command?, args?: string[], url? }` → 201 Plugin. `DELETE
/v1/plugins/{id}` uninstalls (204; disconnect + drop from catalog). No
separate disconnect endpoint. Do not auto-open a connect card. GET and
`POST .../auth` stay v0.10. No store / search catalog. Plugins list is
Settings only.

v0.13 event listeners, webhook first: a routine is cron XOR trigger.
GET adds `kind`; `schedule` only for cron; `webhookUrl` only for
kind=webhook (token in the path; Copy; clients must not paint it);
optional `label` for Slack/GitHub. POST `{ name, skill, trigger: { type:
webhook } }` → 201 with `webhookUrl`. Incoming fire is `POST
{webhookUrl}` (no Bearer). 204 then the skill into that agent's 1:1.
Paused or unknown token 404 and does not run. Slack/GitHub
`trigger.type` 422 unless GET `/v1/plugins` shows that plugin
status=connected. Chrome: muted `Webhook` / `Weekdays 9:00` plus Copy
for the URL. No New routine button.

v0.14 Box computer preview: `GET /v1/agents/{id}/computer`
`{ hasSandbox, width: 1280, height: 800, imageUrl }`. `imageUrl` is
`GET /v1/agents/{id}/computer/screenshot` (Bearer, image/png).
hasSandbox false omits imageUrl. Channel 409. Missing agent 404.

v0.15 Box takeover (desktop + runtime): `POST /v1/agents/{id}/computer/session`
→ 201 `{ sessionId }`. `DELETE .../session` or
`DELETE .../session/{sessionId}` → 204. While the session exists,
`POST .../pointer` `{ x, y, type }` and `POST .../key` `{ key, type, text? }`
in 1280×800 (200). GET may include `driving: user|agent|idle`. Agent
tools that drive the sandbox 409. Channel 409. iOS does not POST these
routes.

v0.16 teach-a-task (desktop + runtime): Record only inside a takeover
session. `POST /v1/agents/{id}/computer/record` → 201 `{ recording: true }`
(409 without session / already recording). `DELETE .../record` → 204
(no SKILL.md; pending until save or discard). `POST /v1/agents/{id}/skills
{ name }` → 201 Skill `{ id, name }` (422 empty name / no pending
capture). GET may include `recording` when hasSandbox. Channel 409.
iOS does not POST these routes.

v0.17 create/delete routine chrome: `DELETE /v1/agents/{id}/routines/{routineId}`
→ 204 (unknown 404; channel 409). POST still cron XOR webhook. Chrome:
trailing 12px `Add` on Routines, 320px `Add routine` sheet (name +
SKILL.md picker + Schedule/Webhook), muted 12px `Remove` +
`Remove {name}?`. Pause stays. Copy stays webhook-only. Slack/GitHub
kinds remain list-only.

A copy is also kept at `runtime/openapi.yaml` and `desktop/openapi.yaml`
so those trees are self-contained. Do not let the files diverge.

iOS `/v1` Codable types are generated from this file:

```bash
python3 ios/scripts/generate_v1_types.py
```
