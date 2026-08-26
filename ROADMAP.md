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
| Create / list / patch / delete agents | Teach-a-task / recording / separate Box window / VNC |
| Transcript persistence (SQLite) | “Teach a task”, MCP marketplace UI |
| `POST .../messages` as SSE (`message.delta` / `message.done` / `tool.*` / `error`) plus `kind=widget` `message.done` | Extra SSE event types (`widget.*`) |
| Question widgets (`ask_user_question`; POST `widgetReply: { id, values?, dismissed? }`; not a user bubble) | Tool-approval cards; widgets on the channel timeline |
| Bearer token LAN auth; bind localhost until a token exists | Vision (images persist, not sent to the model) |
| Mock inference, **oMLX**, or **vLLM** OpenAI-compat | TensorRT-LLM |
| Tauri + TypeScript chat UI; 320px computer pane (file tree + text preview, collapsible); agent-pane 288×180 computer preview + desktop Open/Done takeover | Full sandbox computer GUI (browser, terminal, VNC); iOS tap-to-open |
| Swift/SwiftUI iOS companion (chat + muted tool traces + agent-sheet computer preview) | Extra channel types; iOS takeover |
| Seeded group channel + extra user-created channels + agent DMs + @mentions + v0.2 handoff threads + v0.3 identity pane + v0.4 report-back + v0.8 question widgets + v0.9 routines list + v0.10 connect chrome + v0.11 assistant markdown + v0.12 MCP Add custom + v0.13 webhook event listeners + v0.14 Box computer preview + v0.15 Box takeover (desktop) | Slack/GitHub inbound listeners; create/edit/delete routine UI; teach-a-task |
| Runtime-owned tools: list_dir, read_file, write_file, delete_file, shell (no extra network), web_search (configured provider), web_fetch; auto-run; sandbox under `~/.snorlax-bot`; GET workspace list/read for the desktop pane | Host Docker/SSH secrets in the tool env; Mac folder picker; approval widgets |
| Runtime MCP client: stdio subprocess + LAN HTTP/SSE from `mcp.json` under `SNORLAX_DATA_DIR`; namespaced `server__tool`; built-ins win; `GET /v1/plugins` + `POST .../auth` + `kind=connect` + Settings Add custom (`POST /v1/plugins`, `DELETE .../{id}`; no separate disconnect) | Public-cloud MCP requirement; clients speaking MCP; marketplace catalog / public plugin store |
| Skills (`SKILL.md` in workspace and/or `SNORLAX_DATA_DIR/skills`) + cron XOR webhook routines (Asia/Taipei cron; GET list + PATCH enabled; webhook URL + Copy; fire LEFT 1:1 with `routineName`) | Teach-a-task; marketplace / skill picker; Slack/GitHub inbound |
| OpenAPI for `/v1` | |

Default model on Spark: **70B-class FP8**, swapped via config.

Locked v0.1 / v0.2 / v0.3 / v0.4 / v0.5 / v0.6 / v0.7 / v0.8 / v0.9 / v0.10 / v0.11 / v0.12 / v0.13 / v0.14 / v0.15 (chat layout + agent messaging + collaboration handoff + identity pane + report-back + extra channels + basic tools + computer pane + runtime MCP client + question widgets + skills and cron routines + MCP connect chrome + assistant markdown + MCP Add custom + webhook event listeners + Box computer preview + Box takeover): [docs/specs/v0.1-chat-and-agents.md](docs/specs/v0.1-chat-and-agents.md).

## v1 — computer and tools

- Local sandbox computer shared by all bots on the Spark (browser, filesystem,
  terminal), isolated to the machine owner, not to a single bot.
- Tool calling through the runtime (never from the desktop straight to vLLM).
- MCP client first slice (v0.7): stdio and LAN-reachable servers from
  `mcp.json`. No requirement that MCP be on the public internet. Marketplace
  UI stays later. v0.12 Add custom is Settings POST/DELETE, not a store.
- Attachments that tools can read; still no default VL unless a VL checkpoint
  is explicitly configured.

## v2 — skills, routines, widgets

- Skills as durable how-to documents a bot can load. **v0.9 first slice:**
  SKILL.md (workspace and/or `SNORLAX_DATA_DIR/skills`) plus cron routines
  (list + enable/pause; fire LEFT 1:1). Teach-a-task and marketplace stay later.
- Routines: assign a skill to a bot on a schedule **or** a webhook
  (v0.13; cron XOR trigger). Slack/GitHub inbound listeners stay later.
- “Teach a task”: record a demonstration on the sandbox computer, draft a
  skill, human reviews.

## v3 — iOS companion and Spark ops

- iOS client on the LAN (same `/v1`, same token), picking up the same bots
  and transcripts.
- Pairing UX: scan/paste token, remember Spark URL.
- Optional live view of a bot’s sandbox screen.
- Serving swap path: TensorRT-LLM behind the same inference interface.
- 200B-class and dual-Spark recipes documented, not required for v0/v1.

## Non-goals (until explicitly promoted)

- Cloud-hosted inference as a product dependency.
- Copying Grok Bot source, assets, or private protocols.
- A workflow-builder UI as the way to start. The start is: create a bot,
  message it.
