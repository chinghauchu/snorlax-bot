# Architecture: a Grok-Bot-like runtime on DGX Spark

Snorlax-Bot maps the public Grok Bot product shape onto a deskside NVIDIA DGX
Spark. The Spark is not a client GPU for a SaaS model. It *is* the always-on
machine the bots live on.

This is an original mapping. It is not a description of Grok Bot internals.

## Product shape we are matching

From public Grok Bot docs and the Aug 2026 launch:

| Grok Bot (cloud) | Snorlax-Bot (Spark) |
| --- | --- |
| Persistent named bots / teammates | `/v1/agents`, seeded `snorlax-bot` |
| Message a bot like a coworker | `POST /v1/agents/{id}/messages` (SSE) |
| One user-scoped computer shared by all bots | Later: one sandbox on the Spark, shared files/logins, per-bot screen |
| Skills (how) and routines (when) | Later: stored on the runtime, executed locally |
| MCP + computer-use for sites without an API | Later: local MCP + sandbox browser |
| Question / approval moments | Later: widgets in the transcript |
| Desktop + iOS, same bots | Tauri desktop now; Swift iOS companion on the LAN |
| Cloud LLM | vLLM on GB10 (70B FP8 default; 200B-class in-range) |

The important inversion: **work does not stall when the laptop closes**,
because the laptop was never the runtime. The DGX Spark stays on the desk,
bound to the LAN, with a bearer token.

## Hardware: why GB10 looks like a local “bot computer”

DGX Spark (GB10 Grace Blackwell):

- 20-core Arm CPU + Blackwell GPU on one superchip (`sm_121`).
- **128 GB coherent unified memory** (LPDDR5x), not discrete HBM VRAM.
  CUDA sees on the order of ~120 GiB of that pool. CPU, GPU, OS, container
  runtime, model weights, and KV cache all draw from it.
- Bandwidth is deskside, not datacenter HBM. This box is for **small-batch
  interactive inference**, not high-QPS serving.
- NVIDIA’s published envelope: up to ~200B-class models on one Spark; two
  units linked via ConnectX-7 for ~405B.

Implications for us:

1. **One resident model at a time** is the v0/v1 assumption. A 70B FP8
   checkpoint plus KV cache plus OS plus (later) a browser sandbox must fit
   together. `--gpu-memory-utilization` should start around 0.7–0.8 and leave
   RAM for everything that is not vLLM.
2. **Keep `--max-num-seqs` low.** A handful of bots chatting and (later)
   using the computer is the workload, not a public API.
3. The FastAPI runtime is cheap compared to weights. It can stay resident.
   The sandbox computer, when it lands, is the other heavy tenant — treat it
   as a first-class memory budget, not an afterthought.

## Process topology (v0)

```
┌──────────────────── desktop / iOS ────────────────────┐
│  Tauri webview  or  SwiftUI  (LAN)                    │
│  Authorization: Bearer <token>                        │
└──────────────────────────┬────────────────────────────┘
                           │ HTTP /v1  (never :8000)
                           ▼
┌──────────────────── snorlax-runtime ──────────────────┐
│  FastAPI (Mac or Spark)                                │
│  • agents, transcripts, images (SQLite)                │
│  • LAN auth, bind policy                               │
│  • inference interface (mock | oMLX | vLLM)            │
│  later: tools, MCP, sandbox, scheduler                 │
└──────────────────────────┬────────────────────────────┘
                           │ OpenAI-compat streaming
                           ▼
┌────────────── oMLX (Mac) or vLLM (Spark) ─────────────┐
│  Mac: oMLX on :8000/v1, no API key to localhost        │
│  Spark: vLLM, 70B-class FP8 by default                 │
│  TensorRT-LLM is a later drop-in behind the same iface │
└────────────────────────────────────────────────────────┘
```

Clients **must not** call oMLX or vLLM. The runtime is the only process that
holds the model URL, the system prompts, the tool list (later), and the token.
Mac-local recipe: [mac-local.md](mac-local.md).

## Bind and auth

Bootstrap is intentionally awkward in the safe direction:

1. If no bearer token file exists, listen on `127.0.0.1` only, generate a
   token, print it, persist it at `~/.snorlax-bot/token`. Pairing happens
   on the Spark itself (or via SSH port-forward). `SNORLAX_TOKEN` overrides
   the file. Clients never read that file.
2. Once a token exists, listen on `0.0.0.0` so an iPhone or another machine
   on the LAN can connect. Every `/v1` route except `GET /v1/health`
   requires `Authorization: Bearer <token>`.
3. `SNORLAX_BIND` overrides the policy for tests and forced localhost.

There is no anonymous LAN. There is also no cloud account.

## Data

SQLite file `~/.snorlax-bot/snorlax.db` (override with `SNORLAX_DATA_DIR`):

- `agents` — id, name, title, description, avatar, kind (`agent` | `channel`), timestamps.
  Seeded agent `snorlax-bot` (name Snorlax, title Assistant, kind agent).
  Seeded group channel `snorlax-bot-group` (name Snorlax-Bot, kind channel).
  Every agent is a member of the seed; new agents auto-join it. Seed DELETE is 204 and is
  not auto-reseeded (an empty agent roster is fine). Seeded channel DELETE is 409.
  User-created channels (`POST /v1/agents` kind=channel) DELETE 204.
  Channel is created if missing on an existing DB. Clients show a muted
  “Channel” subtitle from `kind`, not by guessing id. Seed identity
  (name / title / description / avatar) may be PATCHed and persists.
- `messages` — per-transcript (agent 1:1 or the group), `user` | `assistant`,
  plus `senderId` / `senderName` / `senderAvatar` / `hop` / `mentions`.
  Additive v0.2: `kind` (`message` | `handoff`), `replyTo`, `handoff`
  `{ channelId, threadId }` on the originating user message, `userAsk` /
  `brief` on a handoff root. User bubbles are `senderId=user`; every agent
  is left and labeled as themselves.
- `images` — bytes on disk; API shape `{ id, mime, url }`. **Never forwarded
  to the model.**
- Token is a sibling file `~/.snorlax-bot/token`, not a SQLite setting.

v0.1 keeps one transcript per agent (the 1:1) plus one seeded group channel
and extra user-created channels (v0.4).
GET `/v1/agents/snorlax-bot/messages` is only user + Snorlax. Peer / involve /
DM / hop traffic writes to a channel (default `snorlax-bot-group`). Mentions are runtime-routed
with hop depth 3, 4 peer sends per user turn, and a same-edge cap.

v0.2: a 1:1 `@chip` or agent DM opens a channel **thread** under a
`kind=handoff` root. GET channel messages without `threadId` returns timeline
roots only. Pack B wakes with `{ originating, userAsk, brief, mentionedIds }`
(not a quote). The originating user message may include `handoff: { channelId,
threadId }` so clients can show a jump chip.

v0.3: clicking the chat header opens an info pane. `kind=agent` is identity
(PATCH `{ name, title, description, avatar }`). `kind=channel` is a read-only
member list from `memberIds`. Desktop is a 320px overlay on chat; iOS is a
sheet. Delete stays on the sidebar, including the seed row.

v0.4: when B posts a material reply in the handoff thread, wake A with
`{ from, result, threadId }`. A posts a second assistant turn in A's 1:1
(as A). Isolation unchanged. Extra `kind=channel` rows via POST /v1/agents.

## Inference interface

```text
stream(messages: list[{role, content}]) -> async iter[str]
```

- `mock` — deterministic-ish streaming reply. Default off-Spark and in CI.
- `omlx` — Mac-local OpenAI-compat (`POST {OMLX_BASE_URL}/chat/completions`
  with `stream: true`). Distinct from vLLM. No Bearer to localhost by default.
- `vllm` — Spark `POST {VLLM_BASE_URL}/chat/completions` with `stream: true`.
  Only text `role`/`content` pairs are sent. Images stay on disk.

System prompt is assembled by the runtime from the agent’s `description`.
The desktop cannot inject a hidden system prompt around the runtime.

## What “always-on teammates” means here

On Grok Bot, the computer is a cloud VM that outlives the laptop. On
Snorlax-Bot:

- The **Spark stays powered**. Closing the Tauri window does not unload
  vLLM (separate process) and does not delete transcripts.
- Later, routines fire inside the runtime’s scheduler, not inside the GUI.
- Later, multiple bots share one sandbox so a “chief of staff” bot can hand
  a file to an “inbox” bot without the human pasting.

Until v1, “always-on” is: the runtime + model stay up, chat history is on
disk, and the seeded teammate is still `snorlax-bot` after a reboot.

## Non-copy constraint

We match nouns the public product uses (bot, computer, skill, routine, MCP,
widget) because those are the product. We do not match private APIs, asset
files, or source. The `/v1` contract in this repo is ours.
