# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, LAN auth, the
built-in tool loop, the MCP client, and the cron scheduler. oMLX (Mac-local OpenAI-compat), vLLM (Spark), or the
mock backend sits behind it. Clients never call the model server, never
call tools, never call MCP, and never read `~/.snorlax-bot/` — they use `SNORLAX_URL` +
`SNORLAX_TOKEN`. Desktop may `GET /v1/agents/{id}/workspace` (a runtime
read of the sandbox); iOS does not browse files this slice.

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
A skill has no trigger of its own. No marketplace / client picker.

Routines are cron jobs on an agent (`GET /v1/agents/{id}/routines`,
`PATCH .../routines/{id}` `{ enabled }`). The scheduler runs in this
process (Asia/Taipei). A due run writes a normal assistant Message in
that agent's 1:1 with optional `routineName`. Clients list and
enable/pause only this slice.

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
`POST /v1/plugins/{id}/auth` returns `{ authorizationUrl }` for the OS
browser; the OAuth callback hits this process (GET, or POST complete with
code+state). Unauthenticated MCP servers can persist a `kind=connect`
card. `connectReply { id }` emits `connect.url` then ends; when auth
completes the card is PATCHed connected and the turn continues. Tools
auto-run. No uninstall / store / Add-custom HTTP this slice.

## Tests

```bash
pytest
```
