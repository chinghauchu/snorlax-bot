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
| `SNORLAX_DATA_DIR` | `~/.snorlax-bot` | `snorlax.db` + `token` + images + `workspaces/` + `mcp.json` + `skills/` |
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
host Mac. Tools auto-run. Shell has no extra network; HTTP is `web_search`
/ `web_fetch` only. DELETE of an agent or user-created channel drops its
workspace dir.

## Skills and routines

`SKILL.md` files live in `$SNORLAX_DATA_DIR/skills/<slug>/SKILL.md`.
YAML frontmatter `name` + `description`, then markdown body.
A skill has no trigger of its own. No marketplace catalog.

Routines are cron XOR webhook on an agent (`GET /v1/agents/{id}/routines`,
`POST .../routines`, `PATCH .../routines/{id}` `{ enabled }`,
`DELETE .../routines/{id}` 204). Cron scheduler runs in this
process (Asia/Taipei). Webhook fire is `POST` the minted `webhookUrl`
(`/v1/hooks/{token}` in the path, no Bearer). Enabled → 204 and a
normal assistant Message in that agent's 1:1 with optional
`routineName`. Paused or unknown token → 404, do not run.
Clients list, create, enable/pause, Remove, and Copy the webhook URL.

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
`web_search` / `web_fetch`. MCP HTTP uses the runtime process (like
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
auto-run. No store / search / marketplace catalog.

## Tests

```bash
pytest
```
