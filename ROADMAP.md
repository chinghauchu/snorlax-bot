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
| Create / list / patch / delete agents | Sandbox computer GUI (browser, screenshot pane) |
| Transcript persistence (SQLite) | “Teach a task”, MCP marketplace UI |
| `POST .../messages` as SSE (`message.delta` / `message.done` / `tool.*` / `error`) plus `kind=widget` `message.done` | Extra SSE event types (`widget.*`) |
| Question widgets (`ask_user_question`; POST `widgetReply: { id, values?, dismissed? }`; not a user bubble) | Tool-approval cards; widgets on the channel timeline |
| Bearer token LAN auth; bind localhost until a token exists | Vision (images persist, not sent to the model) |
| Mock inference, **oMLX**, or **vLLM** OpenAI-compat | TensorRT-LLM |
| Tauri + TypeScript chat UI; 320px computer pane (file tree + text preview, collapsible) | Full sandbox computer GUI (browser, screenshot, terminal, VNC) |
| Swift/SwiftUI iOS companion (chat + muted tool traces; no computer pane this slice) | Extra channel types |
| Seeded group channel + extra user-created channels + agent DMs + @mentions + v0.2 handoff threads + v0.3 identity pane + v0.4 report-back + v0.8 question widgets + v0.9 routines list | Event listeners (Slack/GitHub); create/edit/delete routine UI |
| Runtime-owned tools: list_dir, read_file, write_file, delete_file, shell (no extra network), web_search (configured provider), web_fetch; auto-run; sandbox under `~/.snorlax-bot`; GET workspace list/read for the desktop pane | Host Docker/SSH secrets in the tool env; Mac folder picker; approval widgets |
| Runtime MCP client: stdio subprocess + LAN HTTP/SSE from `mcp.json` under `SNORLAX_DATA_DIR`; namespaced `server__tool`; built-ins win | Public-cloud MCP requirement; clients speaking MCP |
| Skills (`SKILL.md` in workspace and/or `SNORLAX_DATA_DIR/skills`) + cron routines (Asia/Taipei; GET list + PATCH enabled; fire LEFT 1:1 with `routineName`) | Teach-a-task; marketplace / skill picker |
| OpenAPI for `/v1` | |

Default model on Spark: **70B-class FP8**, swapped via config.

Locked v0.1 / v0.2 / v0.3 / v0.4 / v0.5 / v0.6 / v0.7 / v0.8 / v0.9 (chat layout + agent messaging + collaboration handoff + identity pane + report-back + extra channels + basic tools + computer pane + runtime MCP client + question widgets + skills and cron routines): [docs/specs/v0.1-chat-and-agents.md](docs/specs/v0.1-chat-and-agents.md).

## v1 — computer and tools

- Local sandbox computer shared by all bots on the Spark (browser, filesystem,
  terminal), isolated to the machine owner, not to a single bot.
- Tool calling through the runtime (never from the desktop straight to vLLM).
- MCP client first slice (v0.7): stdio and LAN-reachable servers from
  `mcp.json`. No requirement that MCP be on the public internet. Marketplace
  UI and Settings picker stay later.
- Attachments that tools can read; still no default VL unless a VL checkpoint
  is explicitly configured.

## v2 — skills, routines, widgets

- Skills as durable how-to documents a bot can load. **v0.9 first slice:**
  SKILL.md (workspace and/or `SNORLAX_DATA_DIR/skills`) plus cron routines
  (list + enable/pause; fire LEFT 1:1). Teach-a-task and marketplace stay later.
- Routines: assign a skill to a bot on a schedule. Event listeners
  (Slack/GitHub) stay later.
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
