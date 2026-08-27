# Snorlax-Bot

An open-source, local Grok Bot-like desktop assistant. Named teammates, shared
computer, skills and routines — running entirely on an [NVIDIA DGX Spark](https://www.nvidia.com/en-us/products/workstations/dgx-spark/)
(GB10 Grace Blackwell superchip, 128 GB coherent unified memory). Inference
stays on the desk. There is no cloud LLM.

Founder: **Chinghau Chu**. License: **Apache-2.0**.

Snorlax-Bot is an independent recreation from the *public product shape* of
Grok Bot (named bots, a persistent computer, skills/routines, MCP connectors,
question widgets, desktop + iOS). It does not include, and is not derived from,
any Grok Bot source.

## Why this exists

Grok Bot is a team of always-on agents with a computer of their own in the
cloud. Snorlax-Bot is that product idea turned inward: the DGX Spark *is* the
computer. Bots live on your LAN, talk through a thin local runtime, and (in
later versions) browse, click, schedule, and call tools without sending tokens
off-box.

v0.24 is still small: **named teammates + identity pane + group channel threads
+ chat with @mentions + report-back + extra channels + built-in tools + a
thin desktop Computer pane + a runtime MCP client + question widgets +
skills and cron/webhook/Slack/GitHub routines (Add / Remove + enable/pause + Copy webhook URL; Slack/GitHub listeners when that plugin is connected) + MCP connect chrome
(Settings plugins list + `kind=connect` card) + assistant markdown +
MCP Add custom (Settings POST / DELETE; no separate disconnect) +
curated plugin catalog (Settings Catalog Slack/GitHub Add; not a store) +
identity-pane Box computer preview (Bearer PNG) + desktop Box takeover
(Open / Done; pointer/key in 1280×800) + teach-a-task (Record / Stop /
Save as skill inside takeover) + skill markdown editor (identity-pane
Skills list + Edit sheet) + iOS Open/Done takeover (same v0.15 session
protocol) + iOS Record (same v0.16 record protocol on the takeover bar) +
composer `/` skill autocomplete (1:1 only; channel `/` is plain text) +
blank New skill (identity-pane Add → `POST { name, body }`)**. Header click opens agent identity (PATCH) or
the channel member list. Agent identity lists routines with a live
enable/pause switch, Add, Remove, and Copy for webhook URLs, then skills
with Add / Edit / Remove. 1:1s are user ↔ that agent only; a user `@chip`
(or agent DM) opens a handoff thread in a channel (seed `snorlax-bot-group`
by default). B answers in the thread; A reports back in A's 1:1 as A. Seed
`snorlax-bot` can be deleted (no auto-reseed). Users can create more
channels. Agents can list/read/write files, run a workspace shell (no extra
network), search or fetch the web, and call MCP tools the runtime loaded
from `~/.snorlax-bot/mcp.json` — the runtime owns that loop and
auto-runs tools; clients never call the model, the tools, or MCP. Channel work
lives in a sandbox under `~/.snorlax-bot` when the channel’s shared-project
toggle is on (default off); otherwise each agent uses its own workspace.
Desktop shows that sandbox as a 320px right pane (file tree + text preview;
collapsible). The agent identity pane shows a live 16:10 computer preview
(Bearer PNG of the runtime-owned 1280×800 display). Desktop Open takes
over that display (overlay on chat + info pane; Esc / Done). While driving,
desktop **Record** captures pointer/key and **Save as skill** writes
SKILL.md (v0.9 list). iOS matches
the preview in the agent sheet and **Open** is a full-screen takeover
(tap the 16:10 shot or 12pt Open; Keyboard + Done). While driving, iOS
**Record** captures pointer/key and **Save as skill** writes SKILL.md
(same v0.16 HTTP). No file
browser. No VNC /
separate Box window. That slice is meant
to actually run on a laptop *or* a Spark, with a mocked model backend when a
70B-class checkpoint is not present.

## Hardware target

| | DGX Spark (intended) |
| --- | --- |
| Superchip | GB10 Grace Blackwell |
| CPU | 20-core Arm (aarch64) |
| GPU | Blackwell, compute capability 12.1 (`sm_121`) |
| Memory | 128 GB LPDDR5x, coherent unified CPU+GPU pool |
| Intended models | ~70B FP8 by default; ~200B-class locally; two Sparks linked for ~405B |

The 128 GB pool is shared by the OS, vLLM weights, KV cache, the FastAPI
runtime, and (later) the sandbox computer. Serving flags must leave headroom —
see [docs/architecture.md](docs/architecture.md).

## Repository layout

```
desktop/     Tauri + TypeScript chat client
ios/         Swift/SwiftUI companion (list, chat, settings)
runtime/     FastAPI agent runtime (in front of vLLM)
protocol/    OpenAPI contract for /v1
docs/        Architecture, Mac-local oMLX recipe, next tickets
```

## Architecture (one paragraph)

Clients never talk to the model server. A thin FastAPI runtime owns agents,
transcripts, and LAN bearer-token auth. It sits in front of **oMLX**
(Mac-local OpenAI-compat) or **vLLM** (Spark); TensorRT-LLM is a later swap
behind the same interface. SQLite on disk holds agents and messages. The
seeded agent id is `snorlax-bot` (PATCH-able; DELETE 204, no auto-reseed). Seeded channel `snorlax-bot-group` DELETE is 204, no auto-reseed. Bind is `127.0.0.1` until a token
exists, then `0.0.0.0` so a phone on the same LAN can reach the host. Details:
[docs/architecture.md](docs/architecture.md). Mac-local recipe:
[docs/mac-local.md](docs/mac-local.md). Locked HTTP contract:
[protocol/openapi.yaml](protocol/openapi.yaml) (copy: `runtime/openapi.yaml`).

## How to run locally (v0 vertical slice)

You do **not** need a DGX Spark or a cloud LLM. The default inference backend
is `mock` (CI and first boot). On a Mac, point the runtime at local **oMLX**.
On a Spark, use **vLLM**. Clients always talk to `:8787`, never `:8000`.

### 1. Runtime

Python 3.11+.

```bash
cd runtime
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
snorlax-runtime
```

On first start the process:

1. Creates a data directory (default `~/.snorlax-bot`, override with
   `SNORLAX_DATA_DIR`)
2. Writes `~/.snorlax-bot/token` and `~/.snorlax-bot/snorlax.db`
3. Seeds agent `snorlax-bot` (name Snorlax, title Assistant) and channel
   `snorlax-bot-group` (name Snorlax-Bot) on a first empty DB. Deleting the
   seed agent or the seed channel does not reseed (never recreate
   `snorlax-bot-group`). After seed channel delete, clients select an
   agent first if any remain, else a remaining channel. Tool workspaces
   are created lazily under `~/.snorlax-bot/workspaces/`.
4. Listens on `127.0.0.1:8787` until that token file exists, then
   `0.0.0.0:8787` on later launches. `SNORLAX_TOKEN` overrides the file.
   Clients use `SNORLAX_URL` + `SNORLAX_TOKEN`; they never read the Spark disk.

```bash
export SNORLAX_TOKEN='<printed token>'
curl -sS -H "Authorization: Bearer $SNORLAX_TOKEN" http://127.0.0.1:8787/v1/agents
```

Chat (SSE):

```bash
curl -N -H "Authorization: Bearer $SNORLAX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the LAN"}' \
  http://127.0.0.1:8787/v1/agents/snorlax-bot/messages
```

Tests:

```bash
cd runtime && pytest
```

### 2. Desktop (web, then Tauri)

Node 20+.

```bash
cd desktop
npm install
npm run dev
```

Open http://127.0.0.1:1420, paste the runtime URL (`http://127.0.0.1:8787`
or `http://localhost:8787`) and the bearer token, then chat with **Snorlax**.
Loopback URLs persist across reload.

The same UI is wrapped by Tauri for a native window:

```bash
cd desktop
npm run tauri dev
```

### 3. On a Mac (oMLX)

oMLX is the first-class local OpenAI-compat backend. It is not vLLM. Recipe:
[docs/mac-local.md](docs/mac-local.md).

```bash
curl -sS http://127.0.0.1:8000/v1/models   # copy data[0].id
export SNORLAX_INFERENCE_BACKEND=omlx
export SNORLAX_OMLX_BASE_URL=http://127.0.0.1:8000/v1
export SNORLAX_MODEL='<id from GET /v1/models>'
# No API key: runtime does not send Authorization to localhost inference.
snorlax-runtime
```

Turn API-key auth **off** in oMLX admin. Desktop Settings: Runtime URL
`http://127.0.0.1:8787`. Clients never call `:8000`.

### 4. On a real DGX Spark

Point the runtime at local vLLM instead of mock or oMLX:

```bash
export SNORLAX_INFERENCE_BACKEND=vllm
export SNORLAX_VLLM_BASE_URL=http://127.0.0.1:8000/v1
export SNORLAX_MODEL=meta-llama/Llama-3.3-70B-Instruct-FP8
snorlax-runtime
```

Default Spark model is **70B-class FP8**, config-swappable. Images may be
attached and persisted; they are **not** sent to the model in v0 (no vision
default).

## v0 vs later

See [ROADMAP.md](ROADMAP.md). Short version: v0.24 is named agents plus
runtime-owned file/shell/web tools in a `~/.snorlax-bot` sandbox, a
thin desktop Computer pane over that sandbox, a runtime MCP client
(stdio + LAN from `mcp.json`), connect chrome (`GET /v1/plugins` +
`kind=connect`), Settings Add custom (`POST /v1/plugins` + uninstall),
curated plugin catalog (`GET /v1/plugins/catalog`; Slack/GitHub Add;
not a store),
question widgets in the transcript, cron XOR webhook/Slack/GitHub routines
(Add / Remove on the identity pane; fire a SKILL.md into that agent's 1:1), assistant markdown
(clients render; content stays a plain string), desktop Box takeover,
teach-a-task (Record inside takeover → SKILL.md), a skill markdown
editor (identity-pane Edit sheet), blank New skill (`POST { name, body }`),
iOS Open/Record, and
1:1 composer `/` skill autocomplete (Send loads SKILL.md; channel `/`
stays plain text).
Later: full sandbox computer GUI, MCP marketplace catalog,
Slack/GitHub inbound listeners.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Next concrete tickets:
[docs/tickets.md](docs/tickets.md).

## License

Apache License 2.0. Copyright 2026 Chinghau Chu.
