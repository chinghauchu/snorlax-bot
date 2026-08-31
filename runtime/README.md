# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, LAN auth, the
built-in tool loop, the MCP client, and the cron scheduler. oMLX (Mac-local OpenAI-compat), vLLM (Spark), or the
mock backend sits behind it. Clients never call the model server, never
call tools, never call MCP, and never read `~/.snorlax-bot/` — they use `SNORLAX_URL` +
`SNORLAX_TOKEN`. Desktop may `GET /v1/agents/{id}/workspace` (a runtime
read of the sandbox); iOS does not browse files this slice.
`GET /v1/agents/{id}/computer` is the identity-pane screenshot descriptor
(`imageUrl` is Bearer PNG at `/v1/agents/{id}/computer/screenshot`).
`POST /v1/agents/{id}/computer/session` opens a desktop takeover (201
`{ sessionId }`); `DELETE` that session or `DELETE .../session` is Done
(204). While the session exists, `POST .../pointer` and `POST .../key`
map into 1280×800 (200). GET may include `driving: user|agent|idle`.
Agent-driven sandbox tools 409. Channel ids are 409. Missing agent 404.
`POST /v1/agents/{id}/computer/record` starts a teach-a-task capture
inside that session (201 `{ recording: true }`; 409 without session /
already recording); `DELETE` that path stops (204, no SKILL.md;
capture pending until save or discard). `POST /v1/agents/{id}/skills
{ name }` → 201 Skill `{ id, name }` writes SKILL.md from the pending
capture (422 empty name / no pending capture). GET may include
`recording` when hasSandbox. `GET /v1/agents/{id}/skills/{sid}` returns
`{ id, name, body }` (full SKILL.md source, frontmatter plus recipe).
`PATCH` `{ name, body }` is 200 (write in place; prefer keep id).
`DELETE .../skills/{sid}` is 204 (no routine cascade). Empty name/body
422. Channel 409. List stays `{ id, name }`.
`POST /v1/agents/{id}/skills { name, body }` (body present) writes a
blank New SKILL.md with no capture (201 `{ id, name }`). `{ name }` with
body omitted is still the record path.

Contract: [../protocol/openapi.yaml](../protocol/openapi.yaml) (copy:
[openapi.yaml](openapi.yaml)).

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
snorlax-runtime
```

Equivalent: `python -m snorlax_runtime`. Port **8787**.

On first start: `~/.snorlax-bot/token` and `~/.snorlax-bot/snorlax.db`.
Bind `127.0.0.1` until a token exists, then `0.0.0.0`. `SNORLAX_TOKEN`
overrides the file.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `SNORLAX_DATA_DIR` | `~/.snorlax-bot` | `snorlax.db` + `token` + images + `workspaces/` + `memory/` + `mcp.json` + `skills/` |
| `SNORLAX_TOKEN` | generated file | Override bearer token |
| `SNORLAX_BIND` | auto | Force host (`127.0.0.1` / `0.0.0.0`) |
| `SNORLAX_PORT` | `8787` | Listen port |
| `SNORLAX_INFERENCE_BACKEND` | `mock` | `mock` (CI), `omlx` (Mac-local), or `vllm` (Spark) |
| `SNORLAX_OMLX_BASE_URL` | `http://127.0.0.1:8000/v1` | oMLX OpenAI-compat base |
| `SNORLAX_VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | Spark vLLM OpenAI-compat base |
| `SNORLAX_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-FP8` | Model id (`GET /v1/models` on oMLX) |
| `SNORLAX_INFERENCE_API_KEY` | unset | Optional key for **non-loopback** inference |
| `SNORLAX_INFERENCE_SEND_AUTH` | auto | `true` forces a Bearer even on localhost |
| `SNORLAX_TOOL_MAX_ROUNDS` | `8` | Cap on runtime tool-loop rounds per generation |
| `SNORLAX_SEARCH_PROVIDER` | `duckduckgo` | `web_search` provider name (not hardcoded in the loop) |
| `SNORLAX_SEARCH_URL` | provider default | Optional search URL template; `{query}` is URL-encoded |
| `SNORLAX_SCHEDULER` | `true` | Cron scheduler inside this process (Asia/Taipei) |
| `SNORLAX_SCHEDULER_INTERVAL` | `15` | Seconds between scheduler ticks |

Loopback inference (`127.0.0.1` / `localhost`) gets **no** `Authorization`
header by default. Do not send the LAN `SNORLAX_TOKEN` to oMLX or vLLM.
Mac recipe: [docs/mac-local.md](../docs/mac-local.md).

Workspaces live under `$SNORLAX_DATA_DIR/workspaces/` (agents/{id} for 1:1).
A channel shared-project toggle (default off) opts that channel into
`channels/{id}/`. That dir is a sandbox — not a picker for a folder on the
host Mac. Tools auto-run except mutating `shell` (v0.32 `kind=approve`).
Read-only `ls` / `cat` / `pwd` / `git status` / `git log` / `git diff`
still auto-run. Shell has no extra network; HTTP is `web_search`
/ `web_fetch` only. DELETE of an agent or user-created channel drops its
workspace dir.

## Skills and routines

`SKILL.md` files live in `$SNORLAX_DATA_DIR/skills/<slug>/SKILL.md`.
YAML frontmatter `name` + `description`, then markdown body.
A skill has no trigger of its own. No marketplace catalog.

Routines are cron XOR webhook / Slack / GitHub on an agent (`GET /v1/agents/{id}/routines`,
`POST .../routines`, `PATCH .../routines/{id}` `{ enabled }`,
`DELETE .../routines/{id}` 204). Cron scheduler runs in this
process (Asia/Taipei). Webhook fire is `POST` the minted `webhookUrl`
(`/v1/hooks/{token}` in the path, no Bearer). Slack/GitHub fire when
that MCP plugin is connected (Slack = messages in that channel;
GitHub = pr-opened / pr-pushed / pr-merged). Enabled → a
normal assistant Message in that agent's 1:1 with optional
`routineName`. Paused Slack/GitHub skips. Paused or unknown webhook token → 404, do not run.
Clients list, create, enable/pause, Remove, and Copy the webhook URL.

v0.31: `POST /v1/agents/{id}/messages` `{ "regenerate": true }` truncates
the last assistant turn in a 1:1 and replays the last user message
(no new user bubble). 422 / 409 as locked. OpenAPI stays 0.18.0.

Identity-pane Skills (below Routines) lists `{ id, name }`. Edit is
`GET` then `PATCH /skills/{sid}` `{ name, body }` (full SKILL.md source
including frontmatter plus recipe, not a rendered preview). Remove is
`DELETE` 204. Blank New is `POST /skills { name, body }` (no capture).
Record-to-skill stays `POST /skills { name }` from a pending capture.

v0.21: a 1:1 user message that starts a token with `/slug` or `/Name`
injects that SKILL.md into the turn (catalog preamble still lists every
skill). Unknown `/foo` stays the user's text. Channel `/` is never a
load path. No new HTTP. OpenAPI stays 0.18.0.

v0.22: same POST `/skills`, two bodies. `{ name, body }` writes SKILL.md
(no capture). `{ name }` omitted body stays the record path. OpenAPI
stays 0.18.0.

v0.23: POST `/routines` Slack `{ type: slack, channel }` and GitHub
`{ type: github, repo }` → 201 when that plugin is connected; unconnected,
empty, or wildcard repo → 422. GET omits those rows unless connected.
Fire is the connected MCP into `fire_routine_now`. OpenAPI stays 0.18.0.

v0.24: `GET /v1/plugins/catalog` (Bearer) lists curated Slack then
GitHub (`{ id, name, transport, command?, args?, url? }`; omit nulls).
Catalog Add is existing `POST /v1/plugins`. Omit a row when that kind
is already in `GET /v1/plugins`. Both installed → 200 `[]`. Not a
store. OpenAPI stays 0.18.0.

v0.25: `POST /v1/agents/{id}/attachments` (Bearer, multipart field
`file`) → 201 `{ id, kind, name, url, size }`. `url` is Bearer
`GET /v1/attachments/{id}`. Over 10MB or `video/*` → 422. Message POST
adds `attachmentIds[]`; empty content is ok if that list is non-empty.
GET message grows `attachments` on user-right. Runtime includes
them in that turn. Legacy `{ mime, data }` images stay off-model. No
`/v1/chats/` resource. OpenAPI stays 0.18.0.

v0.26: GET `attachments` on any `kind=message` (agent LEFT too).
`kind=tool` / `widget` / `connect` stay `[]`. After a turn, runtime
binds sandbox `write_file` and computer screenshot onto that assistant
`kind=message` (same store + Bearer GET). Screenshot is `kind=image`.
`write_file` is `kind=file` unless the path is an image. Composer POST
/ `attachmentIds` unchanged. No new routes. OpenAPI stays 0.18.0.

v0.27: video attachments. Lift the v0.25 `video/*` 422. Same POST
multipart `file` → 201 `kind=video` (`video/*` or a video ext). Video
max 50MB (`Max 50MB.`); image/file stay 10MB. GET attachments on any
`kind=message`. Runtime does not feed video bytes to the model (short
`user attached {name}` stub). Agent `write_file` of a video under 50MB
may bind as `kind=video`. v0.28: built-in `watch_video` `{ attachmentId }`
(auto-run; text description into the tool result; `Watched {name}` on the
existing kind=tool line). Do not auto-call. Video bytes still never go
into the user turn. Desktop/iOS idle. OpenAPI stays 0.18.0.

v0.29: built-in `create_agent` `{ name, title?, description? }` and
`create_channel` `{ name, memberIds? }` wrap existing POST /v1/agents
(`kind=channel` for the latter; empty memberIds still snapshots).
`Created {name}` on the existing kind=tool line. Empty name or unknown
member ids → tool Error (user POST 200). Seed SKILL.md maps 项目 to
create_channel and 员工 to create_agent. Composer Enter does not send
while IME is composing. OpenAPI stays 0.18.0.

v0.35: new agents (POST /v1/agents and create_agent) copy the two seed
SKILL.md files (teammates 项目/员工 and routines 定时/提醒) into
workspaces/agents/{id}/. Missing-file only, never overwrite. Startup
backfill copies them onto any existing agent whose workspace lacks
them. Channels get none. create_agent / create_channel / create_routine
stay in TOOLS_PREAMBLE and the offered tool list whenever tools are on
(not skill-gated). GET /skills just lists them. No new routes. OpenAPI
stays 0.18.0.

v0.36: durable agent memory. `remember` `{ fact }` and `forget`
`{ fact }` are always in TOOLS_PREAMBLE and the offered tool list
whenever tools are on (not skill-gated). Facts persist as markdown
under `$SNORLAX_DATA_DIR/memory/{agentId}/` (not the sandbox workspace;
not snorlax.db). Injected into that speaker's system prompt every turn
(1:1 and channel); survive runtime restart. Tool line is `Remembered` /
`Forgot` (never the fact). Cap 32 then `Error: Memory is full`. Empty
fact is `Error: missing fact`. Channels have no store; a channel turn
writes the speaker's file. DELETE agent drops the dir. Seed SKILL.md
`memory` maps 记住 → remember and 忘掉 → forget (missing-file only).
No new routes. OpenAPI stays 0.18.0.

## MCP (`mcp.json`)

The runtime is the MCP client. Desktop and iOS never speak MCP. Put
`mcp.json` next to `snorlax.db` under `SNORLAX_DATA_DIR`:

```json
{
  "mcpServers": {
    "example-stdio": {
      "command": "python3",
      "args": ["/path/to/my_mcp_server.py"],
      "env": {}
    },
    "example-lan": {
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

Missing or empty file = no MCP; built-ins still work. stdio servers are
subprocesses. A `url` is streamable HTTP on the LAN (loopback, RFC1918, or
`.local` are fine). Use `"transport": "sse"` or a `/sse` path for legacy
SSE. Tools are offered to the model as `server__tool` so they cannot
clobber `list_dir` / `read_file` / `write_file` / `delete_file` / `shell` /
`web_search` / `web_fetch` / `watch_video` / `create_agent` /
`create_channel`. MCP HTTP uses the runtime process (like
`web_fetch`), not the agent shell. If a server fails to start, the runtime
still boots and logs the failure.

`GET /v1/plugins` lists `{ id, name, status: connected|needsAuth }`.
`POST /v1/plugins` `{ name, transport: "stdio" | "url", command?,
args?: string[], url? }` adds a custom server into `mcp.json` (201;
422 missing/invalid). `DELETE /v1/plugins/{id}` uninstalls (204; unknown
404; disconnect + drop from catalog; does not auto-open a connect card).
No separate disconnect endpoint. `POST /v1/plugins/{id}/auth`
returns `{ authorizationUrl }` for the OS browser; the OAuth callback
hits this process (GET, or POST complete with code+state).
Unauthenticated MCP servers can persist a `kind=connect` card.
`connectReply { id }` emits `connect.url` then ends; when auth
completes the card is PATCHed connected and the turn continues. Tools
auto-run. No store / search / public marketplace. Curated Slack/GitHub
is `GET /v1/plugins/catalog` (Catalog Add is the same POST).

## Tests

```bash
pytest
```
