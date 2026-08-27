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
| Files, shell, web on a computer | v0.5: runtime tools in a workspace jail; v0.6: thin file-tree pane |
| One user-scoped computer shared by all bots | Later: one sandbox on the Spark, shared files/logins, per-bot screen |
| Skills (how) and routines (when) | v0.9: SKILL.md + cron (Asia/Taipei); v0.13: cron XOR webhook; v0.17: Add / Remove on the identity pane; v0.18: identity-pane skill markdown editor; v0.21: 1:1 composer `/` loads that SKILL.md (channel `/` stays text); fire LEFT 1:1 |
| MCP + computer-use for sites without an API | v0.7: local/LAN MCP client; v0.10: connect chrome (`GET /v1/plugins` + `kind=connect`); v0.12: Settings Add custom; later: sandbox browser |
| Question / approval moments | v0.8: question widgets (`kind=widget`); tools stay auto-run (no approval card) |
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
│  • built-in tools + MCP client + tool loop             │
│  later: sandbox GUI, scheduler                         │
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
holds the model URL, the system prompts, the tool list, and the token.
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
  Every agent is a member of the seed; new agents auto-join it only if
  that row still exists (if the seed channel is gone they join nothing). Seed agent DELETE is 204 and is
  not auto-reseeded (an empty agent roster is fine). Seeded channel DELETE is 204
  and is not auto-reseeded (an empty roster with no agents and/or no channels is
  fine). User-created channels (`POST /v1/agents` kind=channel) DELETE 204;
  PATCH `{ name, memberIds }` 200. Seed channel PATCH stays 409.
  First empty DB seeds agent + channel; later reconnects do not recreate a
  deleted seed (never recreate `snorlax-bot-group`). After seed channel
  delete, clients select an agent first if any remain, else a remaining
  channel. Clients show a muted
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
- Workspaces (v0.5) — not in SQLite. Created lazily on first tool use:
  `workspaces/agents/{agentId}/` for 1:1 turns (and channel turns when
  shared project is off). `workspaces/channels/{channelId}/` when the
  channel pane **sharedProject** toggle is on (default off). That sandbox
  is under `SNORLAX_DATA_DIR` / `~/.snorlax-bot`, not a picker for a folder
  on the host Mac. Tools cannot escape that root. Isolated from the host
  home directory. Shell has no extra network; HTTP is `web_search` /
  `web_fetch` (and runtime MCP HTTP). Tools auto-run (no approval widgets). Search provider is
  `SNORLAX_SEARCH_PROVIDER` / `SNORLAX_SEARCH_URL`. DELETE of an agent or
  user-created channel drops that workspace dir. v0.6 desktop GETs
  (`/v1/agents/{id}/workspace` and `.../file`) read that same jail.
- `mcp.json` (v0.7) — not in SQLite. Optional file under `SNORLAX_DATA_DIR`
  listing stdio and LAN MCP servers. Desktop/iOS never read it. Empty or
  missing = no MCP; built-ins still work. v0.10 lists those servers on
  `GET /v1/plugins` and authenticates via `POST /v1/plugins/{id}/auth`
  (OS browser; callback hits the runtime). Connect cards persist as
  `kind=connect`.
- Question widgets (v0.8) — `messages.widget` JSON on `kind=widget` rows.
  Answer is POST `widgetReply: { id, values?, dismissed? }` on the same
  transcript; not a new user row. Clients render the card; they never invent
  fields.
- Skills and routines (v0.9 / v0.13) — `SKILL.md` under
  `SNORLAX_DATA_DIR/skills/<slug>/SKILL.md`. Table `routines` (agent,
  skill slug, cron XOR trigger, enabled). Scheduler ticks inside the FastAPI
  process (Asia/Taipei). A due cron or a webhook POST persists a normal
  assistant Message in that agent's 1:1 with optional `routineName`. Channel
  GET/PATCH routines are 409. Missed ticks are skipped. Webhook fire is
  `POST {webhookUrl}` (`/v1/hooks/{token}` in the path, no Bearer).

v0.1 keeps one transcript per agent (the 1:1) plus one seeded group channel
and extra user-created channels (v0.4).
GET `/v1/agents/snorlax-bot/messages` is only user + Snorlax. Peer / involve /
DM / hop traffic writes to a channel (default `snorlax-bot-group`; if that
seed is gone, body `channelId` if it is an existing channel, else skip the log). Mentions are runtime-routed
with hop depth 3, 4 peer sends per user turn, and a same-edge cap.

v0.2: a 1:1 `@chip` or agent DM opens a channel **thread** under a
`kind=handoff` root. GET channel messages without `threadId` returns timeline
roots only. Pack B wakes with `{ originating, userAsk, brief, mentionedIds }`
(not a quote). The originating user message may include `handoff: { channelId,
threadId }` so clients can show a jump chip.

v0.3: clicking the chat header opens an info pane. `kind=agent` is identity
(PATCH `{ name, title, description, avatar }`). Seed `kind=channel` is a
read-only member list from `memberIds`. User-created channels PATCH
`{ name, memberIds }`. Desktop is a 320px overlay on chat; iOS is a
sheet. Delete stays on the sidebar row (including the seed channel), not
in the info pane. After seed channel delete, select an agent first if any
remain, else a remaining channel; never recreate `snorlax-bot-group`.

v0.4: 1:1 @involves log on seed `snorlax-bot-group` when present (body
`channelId` ignored). If the seed is gone, log on body `channelId` if it
is an existing kind=channel row, else skip. When B's thread
turn completes or B is hop/cap dropped, wake A with `{ from, result,
threadId, userAsk }` (prompt only). A posts another assistant turn in
A's 1:1 (as A, not a hop). Report as each peer lands. Isolation unchanged.
Extra `kind=channel` rows via POST /v1/agents; members are editable.
Seed channel DELETE is 204 with no auto-reseed. New agents auto-join the
seed only while that row exists.

v0.5: the runtime owns a function-calling loop against oMLX/vLLM (cap 8
rounds). Built-in tools are list_dir, read_file, write_file, delete_file,
shell, web_search, web_fetch. 1:1 tools use the speaking agent's workspace;
channel / handoff tools use the channel sandbox only when `sharedProject`
is on (default off). Additive SSE `tool.start` / `tool.done` as 12px muted
status under the LEFT streak. Tools auto-run. MCP joins that same loop
from `mcp.json` (stdio + LAN). No extra shell network, no host-folder
picker.

v0.6: desktop shows that sandbox as a 320px right Computer pane (file tree
+ text preview, collapsible, default open). `GET /v1/agents/{id}/workspace`
and `.../file` are runtime reads of the same roots. iOS has no pane this
slice. No screenshot stream, no terminal GUI, no VNC.

v0.7: the FastAPI runtime is the MCP client. Config is `mcp.json` under
`SNORLAX_DATA_DIR`. Tools are namespaced `server__tool`; built-in names win.
Clients never call MCP. A failed MCP server does not prevent boot.

v0.8: `ask_user_question` persists `kind=widget` LEFT. Answer is POST
`widgetReply` on the same transcript, not a user bubble.

v0.9: skills (`SKILL.md`) plus cron routines in Asia/Taipei. The FastAPI
process owns the scheduler. A due run is a normal assistant Message in
that agent's 1:1 with optional `routineName`. Agent info pane lists
routines with a live enable/pause switch. Channel pane and Computer pane
unchanged.

v0.10: MCP connect chrome. `GET /v1/plugins` + `POST /v1/plugins/{id}/auth`
(`authorizationUrl` for the OS browser). Message `kind=connect` (not
`kind=widget`). Plugins list is Settings only.

v0.11: assistant markdown is client-only. `Message.content` stays a
string; do not add contentType, mime, html, or blocks[]. Runtime does
not rewrite or split. SSE `message.delta` stays text chunks. User
messages stay plain as stored. LEFT `kind=message` is 14px markdown
(16/14 headings, no grey bubble). User-right stays plain (`https://`
tappable). Fenced code: language + Copy, 12px/1.45. Inline: 13px / 4px /
accent 18%.

v0.12: MCP Add custom. `POST /v1/plugins` `{ name, transport: "stdio"|"url",
command?, args?, url? }` → 201. `DELETE /v1/plugins/{id}` uninstalls
(204; disconnect + drop from catalog). No separate disconnect endpoint.
Do not auto-open a connect card. GET and `POST .../auth` stay v0.10.
Settings-only; no store. Clients never speak MCP.

v0.13: event listeners, webhook first. A routine is cron XOR trigger.
`POST {webhookUrl}` (`/v1/hooks/{token}` in the path, no Bearer) fires
the skill into that agent's 1:1 (same path as cron). Success 204.
Paused or unknown token 404. GET returns `kind`; `schedule` only for
cron; `webhookUrl` only for kind=webhook (Copy; clients must not paint
it); optional `label` for Slack/GitHub. Slack/GitHub `trigger.type` 422
unless GET `/v1/plugins` shows that plugin status=connected; inbound
Slack/GitHub is not this slice. Pause still PATCH `{ enabled }`. No New
routine button.

v0.14: Box computer preview. Runtime owns a per-agent 1280×800 sandbox
display. `GET /v1/agents/{id}/computer` returns `{ hasSandbox, width: 1280,
height: 800, imageUrl }`. `imageUrl` is `GET .../computer/screenshot`
(Bearer, image/png). Channel id is 409. Missing agent 404. No
click/key/scroll POST. Agent identity pane
(desktop 320px overlay / iOS sheet) shows a 16:10 shot above Routines
(288×180, 8px radius). No sandbox → omit imageUrl, `No computer yet.`
no frame. Idle desktop still on. File-tree 320px column unchanged. Do
not reintroduce `computerPane.ts`.

v0.15: Box takeover. Desktop + runtime only. iOS unchanged (preview
only; no tap-to-open, no session POST). `POST /v1/agents/{id}/computer/session`
201 `{ sessionId }`; `DELETE .../session` or `DELETE .../session/{sessionId}`
204. While the session exists, `POST .../pointer`
`{ x, y, type }` and `POST .../key` `{ key, type, text? }` in 1280×800
(200). GET may include `driving: user|agent|idle`. Agent tools that
drive the sandbox 409. Channel 409. Desktop identity
pane: 12px muted Computer + trailing 12px Open when hasSandbox; 288×180
pointer cursor, click Opens. Overlay over chat + info pane (sidebar
stays). Scrim `--bg`. 1280×800 letterboxed, 8px radius, 1px border.
52px bar: 24px avatar + name, 12px muted `You're driving · agent paused`,
trailing primary Done 36px. Esc = Done. Composer inert. Done returns to
display-only; preview last frame. File-tree column untouched. Teach-a-task
waits. Out: recording, a separate OS window, VNC.

v0.16: teach-a-task. Desktop + runtime only. iOS unchanged (no Record,
no Save-as-skill). Record only inside a takeover session.
`POST /v1/agents/{id}/computer/record` starts capture;
`DELETE .../record` stops (no file yet);
`POST /v1/agents/{id}/skills { name }` writes SKILL.md from that
capture (v0.9 load path; 201 Skill `{ id, name }`). GET may include `recording`
when hasSandbox. Channel 409. No session / already recording 409. Capture records
pointer/key plus screenshot context. Desktop 52px bar: 12px muted
Record left of Done; recording is 12px `--danger` Stop + 6px danger
dot (static if Reduce Motion); Done disabled while recording; Esc
while recording = Stop. Stop opens 320px Save as skill. Out: blank New
skill UI, marketplace, iOS record, VNC, a separate OS window.

v0.17: create/delete routine chrome. Runtime + desktop + iOS. Routines
header trailing 12px `Add` (Plugins family). Empty still `No routines
yet.` — Add still shows. 320px `Add routine` sheet: Name 14px; 44px
SKILL.md rows from GET skills `{ id, name }` (none: 12px `No skills
yet.`); segmented Schedule/Webhook; cron placeholder plus 12px muted
Taipei hint. Webhook: no extra fields; Copy left of Remove. GET skills
empty 200 `[]`, channel 409. POST cron/webhook 201; Slack/GitHub
trigger 422. `DELETE .../routines/{id}` 204 (unknown 404; channel
409). Every row muted 12px `Remove` left of pause + `Remove {name}?`.
Pause stays. Out: marketplace, iOS Open/Record/takeover, skill
markdown editor, Slack/GitHub trigger builder.

v0.18: skill markdown editor. Runtime + desktop + iOS. Skills block
below Routines: 12px muted `Skills`; empty `No skills yet.`; 44px
rows with name 14px and trailing 12px muted Edit then Remove;
`Remove {name}?`. No blank Add — create stays teach-a-task. 320px
`Edit skill` sheet: Name 14px; body textarea 12px/1.45 mono,
min-height 200px (SKILL.md source, not a rendered preview); Save
36px / iOS 44pt disabled until name and body; × discards. GET
`/skills/{sid}` `{ id, name, body }` (`body` is full SKILL.md source
including frontmatter plus recipe); PATCH `{ name, body }` 200 (write
in place; prefer keep `id` stable); DELETE 204 (no routine cascade).
List stays `{ id, name }`. Channel 409. Unknown sid 404. Empty
name/body 422. Out: marketplace, iOS Open/Record/takeover, `/`
autocomplete, blank New skill.

v0.19: iOS takeover. iOS only. Desktop Open/Done stays v0.15. Runtime
protocol unchanged: reuse v0.15 POST/DELETE `/computer/session` plus
pointer/key. OpenAPI stays 0.18.0. `recording` unused. Agent sheet:
12pt Open when hasSandbox; 16:10 shot also Opens; empty `No computer
yet.` has no Open. Open is full-screen (not a sheet). Safe-area 52pt
bar: 24pt avatar + name, 12pt muted `You're driving · agent paused`,
trailing 12pt Keyboard then primary Done 44pt. Keyboard focuses a
hidden field → POST `…/key`. Letterboxed 1280×800: tap is click, pan
is move, no pinch, swipe-back disabled. Done DELETE session, back to
the still. Composer covered. Channel pane unchanged. No Record.

v0.20: iOS Record. iOS only. Desktop Record/Stop/Save stays v0.16.
Runtime protocol unchanged: reuse v0.16 POST/DELETE `/computer/record`
then `POST /skills { name }`. Discard is omit that POST. OpenAPI stays
0.18.0. Takeover bar: 12pt muted Record left of primary Done.
Keyboard stays trailing (v0.19). Recording: 12pt `--danger` Stop plus
a 6pt danger dot (static if Reduce Motion); Done disabled while
recording. No Esc — Stop is the only way out of record. Stop opens
Save as skill sheet (Edit skill family; Name 14pt; Save 44pt);
× / Cancel discards — no SKILL.md. Save writes that agent's skill
(v0.18 list, no extra chrome) and returns to takeover with Record
muted again. Keyboard / tap-click / pan-move / Done from v0.19 stay.
Record only inside a takeover session. Channel 409.

v0.21: composer `/` skill autocomplete. Runtime + desktop + iOS. 1:1
agent composer only. `/` at a token start opens the existing `@`
typeahead overlay (240px / 240pt, `--bg-elevated`, 1px border, 8px /
8pt radius; rows 36px / 44pt; name 14px / 14pt; no avatar; filter by
name). Pick inserts `/name` as plain text. Send injects that agent's
SKILL.md into the 1:1 turn (`/slug` or `/Name`). Unknown `/foo` stays
plain text. Channel `/` is plain text — no popup, no load path. Empty
list or no match: no popup. Typeahead is existing GET `/skills`. No
new HTTP. OpenAPI stays 0.18.0. Out: marketplace, blank New, `@skill`.

## Inference interface

```text
generate(messages, tools?) -> async iter[text | tool_calls]
```

- `mock` — deterministic-ish streaming reply. Emits fake tool calls for
  test/demo phrases (`Write a file named …`, `Run pwd…`, `Search the web
  for …`, `Fetch the url …`). Default off-Spark and in CI.
- `omlx` — Mac-local OpenAI-compat (`POST {OMLX_BASE_URL}/chat/completions`
  with `stream: true` and a tools array). Distinct from vLLM. No Bearer to
  localhost by default.
- `vllm` — Spark `POST {VLLM_BASE_URL}/chat/completions` with `stream: true`.
  Only text `role`/`content` pairs (plus tool messages) are sent. Images stay
  on disk.

System prompt is assembled by the runtime from the agent’s `description`
plus a tools preamble. The desktop cannot inject a hidden system prompt
around the runtime. Clients never send a tools payload.

## What “always-on teammates” means here

On Grok Bot, the computer is a cloud VM that outlives the laptop. On
Snorlax-Bot:

- The **Spark stays powered**. Closing the Tauri window does not unload
  vLLM (separate process) and does not delete transcripts.
- Routines fire inside the runtime’s scheduler (v0.9), not inside the GUI.
- Later, multiple bots share one sandbox so a “chief of staff” bot can hand
  a file to an “inbox” bot without the human pasting.

Until v1, “always-on” is: the runtime + model stay up, chat history is on
disk, workspaces persist under `~/.snorlax-bot/workspaces/`, and the seeded
teammate is still `snorlax-bot` after a reboot.

## Non-copy constraint

We match nouns the public product uses (bot, computer, skill, routine, MCP,
widget) because those are the product. We do not match private APIs, asset
files, or source. The `/v1` contract in this repo is ours.
