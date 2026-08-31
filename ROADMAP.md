# Roadmap

Snorlax-Bot ships as a local teammate runtime on DGX Spark. The public product
shape we are aiming at: named bots, a persistent computer, skills and
routines, MCP connectors, question widgets, attachments, desktop + iOS.

## v0 — this repository’s current slice

Named agents plus runtime-owned file/shell/web tools and a runtime MCP client.
Meant to *run*, including without a GPU.

| In | Out |
| --- | --- |
| Seeded agent `snorlax-bot` (Snorlax 1:1, PATCH identity; DELETE 204) and channel `snorlax-bot-group` (DELETE 204, no auto-reseed, never recreate) | MCP marketplace UI / Settings picker |
| Create / list / patch / delete agents | Separate Box window / VNC |
| Transcript persistence (SQLite) | MCP marketplace UI |
| `POST .../messages` as SSE (`message.delta` / `message.done` / `tool.*` / `error`) plus `kind=widget` `message.done` | Extra SSE event types (`widget.*`) |
| Question widgets (`ask_user_question`; POST `widgetReply: { id, values?, dismissed? }`; not a user bubble). v0.32 mutating shell Approve (`kind=approve`; POST `approveReply: { id, approved: true }` or `{ dismissed: true }`; read-only ls/cat/pwd/git status\|log\|diff still auto-run). v0.33 create/delete routine confirm reuses `kind=widget` (Save / Don't, Remove / Keep) | Widgets on the channel timeline; extra approval chrome (routine confirm as a new kind) |
| Bearer token LAN auth; bind localhost until a token exists | Public unauthenticated URLs. Legacy `MessageCreate.images` persist off-model |
| Mock inference, **oMLX**, or **vLLM** OpenAI-compat | TensorRT-LLM |
| Tauri + TypeScript chat UI; 320px computer pane (file tree + text preview, collapsible; v0.34 12px seam chevron, default collapsed, last choice persisted); agent-pane 288×180 computer preview + desktop Open/Done takeover + Record/Stop/Save as skill | Full sandbox computer GUI (browser, terminal, VNC) |
| Swift/SwiftUI iOS companion (chat + muted tool traces + agent-sheet computer preview + Open/Done takeover + Record/Stop/Save as skill) | Extra channel types |
| Seeded group channel + extra user-created channels + agent DMs + @mentions + v0.2 handoff threads + v0.3 identity pane + v0.4 report-back + v0.8 question widgets + v0.9 routines list + v0.10 connect chrome + v0.11 assistant markdown + v0.12 MCP Add custom + v0.13 webhook event listeners + v0.14 Box computer preview + v0.15 Box takeover (desktop) + v0.16 teach-a-task (desktop Record inside takeover) + v0.17 create/delete routine UI + v0.18 skill markdown editor + v0.19 iOS takeover (Open/Done; v0.15 session protocol) + v0.20 iOS Record (v0.16 record protocol) + v0.21 1:1 composer `/` skill autocomplete (Send loads SKILL.md; channel `/` is plain text) + v0.22 blank New skill (`POST /skills { name, body }`; identity-pane Add) + v0.23 Slack/GitHub inbound listeners (Add-routine Slack/GitHub segments when connected; fire 1:1 as A) + v0.24 curated plugin catalog (Settings Catalog Slack/GitHub Add; not a store) + v0.25 chat attachments (composer paperclip / drop; user-right image + file chips; `attachmentIds` in that turn) + v0.26 agent-sent attachments (LEFT kind=message reuses that chrome; runtime binds write_file / screenshot) + v0.27 video attachments (composer drop/pick; 220×160 player; kind=video; 50MB; not fed to the model) + v0.28 watch-video tool (`watch_video` `{ attachmentId }`; `Watched {name}` on the existing kind=tool line; no auto-inject) + v0.29 IME Enter + create agent/channel tools (`create_agent` / `create_channel` wrap `POST /v1/agents`; `Created {name}`; 项目 / 员工 seed skill) + v0.30 composer clipboard paste (Cmd-V / Ctrl-V / paste event → same pending chips; text-only paste stays in the field) + v0.31 Copy / Regenerate on assistant LEFT kind=message (Copy 1:1 and channel; Regenerate 1:1 latest only; `{ regenerate: true }`) + v0.32 shell Approve (`kind=approve`; mutating `shell` pauses; `approveReply` on the same POST; read-only ls/cat/pwd/git status\|log\|diff auto-run) | public marketplace / search; extra channel types |
| Runtime-owned tools: list_dir, read_file, write_file, delete_file, shell (no extra network; v0.32 mutating shell is `kind=approve`; read-only ls/cat/pwd/git status/log/diff auto-run), web_search (configured provider), web_fetch, watch_video (v0.28; auto-run; conversation-scoped text description), create_agent / create_channel (v0.29; wrap POST /v1/agents; `Created {name}`), create_routine / pause_routine / delete_routine (v0.33; wrap existing routine HTTP; create/delete confirm on existing `kind=widget`; pause auto-runs); v0.35 always in the tool preamble (not skill-gated); other tools auto-run; sandbox under `~/.snorlax-bot`; GET workspace list/read for the desktop pane | Host Docker/SSH secrets in the tool env; Mac folder picker |
| Runtime MCP client: stdio subprocess + LAN HTTP/SSE from `mcp.json` under `SNORLAX_DATA_DIR`; namespaced `server__tool`; built-ins win; `GET /v1/plugins` + `POST .../auth` + `kind=connect` + Settings Add custom (`POST /v1/plugins`, `DELETE .../{id}`; no separate disconnect) + curated catalog (`GET /v1/plugins/catalog`; Slack/GitHub; not a store) | Public-cloud MCP requirement; clients speaking MCP; public plugin store / search |
| Skills (`SKILL.md` in workspace and/or `SNORLAX_DATA_DIR/skills`) + cron XOR webhook/Slack/GitHub routines (Asia/Taipei cron; GET/POST/PATCH + DELETE 204; webhook URL + Copy; Slack/GitHub fire LEFT 1:1 with `routineName` when that plugin is connected; identity-pane Add/Remove) + desktop teach-a-task (`POST /computer/record` → `POST /skills { name }`) + identity-pane skill markdown editor (`GET/PATCH/DELETE /skills/{sid}`) + blank New skill (`POST /skills { name, body }`; identity-pane Add; record `{ name }` omitted body stays) + 1:1 composer `/` skill autocomplete (existing `GET /skills`; Send injects that SKILL.md; unknown `/foo` and channel `/` stay plain text) + v0.35 new agents copy seed SKILL.md (teammates + routines) into their workspace; startup backfill for existing agents | Public marketplace / search; event-picker UI |
| OpenAPI for `/v1` | |

Default model on Spark: **70B-class FP8**, swapped via config.

Locked v0.1 / v0.2 / v0.3 / v0.4 / v0.5 / v0.6 / v0.7 / v0.8 / v0.9 / v0.10 / v0.11 / v0.12 / v0.13 / v0.14 / v0.15 / v0.16 / v0.17 / v0.18 / v0.19 / v0.20 / v0.21 / v0.22 / v0.23 / v0.24 / v0.25 / v0.26 / v0.27 / v0.28 / v0.29 / v0.30 / v0.31 / v0.32 / v0.33 / v0.34 / v0.35 (chat layout + agent messaging + collaboration handoff + identity pane + report-back + extra channels + basic tools + computer pane + runtime MCP client + question widgets + skills and cron routines + MCP connect chrome + assistant markdown + MCP Add custom + webhook event listeners + Box computer preview + Box takeover + teach-a-task + create/delete routine UI + skill markdown editor + iOS takeover + iOS Record + composer `/` skill autocomplete + blank New skill + Slack/GitHub inbound listeners + curated plugin catalog + chat attachments + agent-sent attachments + video attachments + watch-video tool + IME Enter + create agent/channel tools + composer clipboard paste + Copy / Regenerate + shell Approve + agent-created routines + user-right bubble wrap + collapse Computer pane + agent bootstrap): [docs/specs/v0.1-chat-and-agents.md](docs/specs/v0.1-chat-and-agents.md).

## v1 — computer and tools

- Local sandbox computer shared by all bots on the Spark (browser, filesystem,
  terminal), isolated to the machine owner, not to a single bot.
- Tool calling through the runtime (never from the desktop straight to vLLM).
- MCP client first slice (v0.7): stdio and LAN-reachable servers from
  `mcp.json`. No requirement that MCP be on the public internet. v0.12
  Add custom is Settings POST/DELETE, not a store. **v0.24:** curated
  Slack/GitHub catalog (`GET /v1/plugins/catalog`) is Settings Add, not
  a public store. Marketplace search stays later.
- Attachments that tools can read; v0.25 user-right `attachmentIds` and
  v0.26 agent-sent `write_file` / screenshot files already go on that
  `kind=message`. **v0.27:** video `attachmentIds` and agent-bound
  sandbox video (under 50MB) go on that `kind=message`; clients play;
  the model does not auto-watch. **v0.28:** the agent may call
  `watch_video` `{ attachmentId }` for a text description (`Watched
  {name}` on the existing tool line). **v0.30:** composer clipboard
  paste fills the same pending chips (paperclip / drop unchanged).

## v2 — skills, routines, widgets

- Skills as durable how-to documents a bot can load. **v0.9 first slice:**
  SKILL.md (workspace and/or `SNORLAX_DATA_DIR/skills`) plus cron routines
  (list + enable/pause; fire LEFT 1:1). **v0.16:** desktop teach-a-task
  records a demonstration inside takeover and writes SKILL.md. **v0.35:**
  new agents copy the seed agent's SKILL.md (teammates + routines) into
  their workspace (startup backfill for existing agents); create_agent / create_channel / create_routine stay
  in the tool list whenever tools are on (not skill-gated). Marketplace stays later.
- Routines: assign a skill to a bot on a schedule **or** a webhook
  (v0.13; cron XOR trigger). **v0.17:** identity-pane Add / Remove
  (Schedule or Webhook). **v0.23:** Slack/GitHub inbound listeners
  when that MCP plugin is already connected (Add-routine segments;
  fire 1:1 as A). Event-picker UI stays later.
- “Teach a task” (v0.16 desktop): record a demonstration on the sandbox
  computer during takeover, save as a skill. **v0.18:** identity-pane
  Edit sheet for SKILL.md source (desktop + iOS). **v0.19:** iOS Open/Done
  takeover (same v0.15 session protocol). **v0.20:** iOS Record/Stop/Save
  as skill on that takeover bar (same v0.16 record protocol). **v0.21:**
  1:1 composer `/` skill autocomplete (existing `@` overlay; Send loads
  that agent’s SKILL.md; channel `/` is plain text). **v0.22:** blank
  New skill (identity-pane Add; `POST /skills { name, body }`; record
  `{ name }` omitted body stays). Marketplace stays later.

## v3 — iOS companion and Spark ops

- iOS client on the LAN (same `/v1`, same token), picking up the same bots
  and transcripts.
- Pairing UX: scan/paste token, remember Spark URL.
- Optional live view of a bot’s sandbox screen. **v0.19:** iOS Open/Done
  takeover on the agent-sheet Computer still (full-screen; v0.15 session
  protocol). **v0.20:** iOS Record/Stop/Save as skill on that takeover
  bar (v0.16 `POST/DELETE /computer/record` then `POST /skills { name }`).
- Serving swap path: TensorRT-LLM behind the same inference interface.
- 200B-class and dual-Spark recipes documented, not required for v0/v1.

## Non-goals (until explicitly promoted)

- Cloud-hosted inference as a product dependency.
- Copying Grok Bot source, assets, or private protocols.
- A workflow-builder UI as the way to start. The start is: create a bot,
  message it.
