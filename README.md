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

v0.4 is still small: **named teammates + identity pane + group channel threads
+ chat with @mentions + report-back + extra channels**. Header click opens
agent identity (PATCH) or the channel member list. 1:1s are user ↔ that agent
only; a user `@chip` (or agent DM) opens a handoff thread in a channel (seed
`snorlax-bot-group` by default). B answers in the thread; A reports back in
A's 1:1 as A. Seed `snorlax-bot` can be deleted (no auto-reseed). Users can
create more channels. No tools, no sandbox computer, no vision.
That slice is meant to actually run on a laptop *or* a Spark, with a mocked
model backend when a 70B-class checkpoint is not present.

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
   agent first if any remain, else a remaining channel.
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

See [ROADMAP.md](ROADMAP.md). Short version: v0 is chat-only named agents.
Later: sandbox computer, skills, routines, MCP, question widgets, iOS
companion that actually talks to the Spark.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md). Next concrete tickets:
[docs/tickets.md](docs/tickets.md).

## License

Apache License 2.0. Copyright 2026 Chinghau Chu.
