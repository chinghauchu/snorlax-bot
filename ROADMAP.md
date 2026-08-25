# Roadmap

Snorlax-Bot ships as a local teammate runtime on DGX Spark. The public product
shape we are aiming at: named bots, a persistent computer, skills and
routines, MCP connectors, question widgets, attachments, desktop + iOS.

## v0 — this repository’s current slice

Chat-only named agents. Meant to *run*, including without a GPU.

| In | Out |
| --- | --- |
| Seeded agent `snorlax-bot` (Snorlax 1:1) and channel `snorlax-bot-group` | Tools / function calling |
| Create / list / patch / delete agents | Sandbox computer (browser, fs, terminal) |
| Transcript persistence (SQLite) | Skills, “teach a task”, routines |
| `POST .../messages` as SSE (`message.delta` / `message.done` / `error`) | MCP connectors |
| Bearer token LAN auth; bind localhost until a token exists | Vision (images persist, not sent to the model) |
| Mock inference, **oMLX**, or **vLLM** OpenAI-compat | TensorRT-LLM |
| Tauri + TypeScript chat UI | Computer pane / tools |
| Swift/SwiftUI iOS companion | Skills, “teach a task”, routines |
| Seeded group channel + agent DMs + @mentions + v0.2 handoff threads | Extra user-created channels |
| OpenAPI for `/v1` | Question widgets |

Default model on Spark: **70B-class FP8**, swapped via config.

Locked v0.1 / v0.2 (chat layout + agent messaging + collaboration handoff): [docs/specs/v0.1-chat-and-agents.md](docs/specs/v0.1-chat-and-agents.md).

## v1 — computer and tools

- Local sandbox computer shared by all bots on the Spark (browser, filesystem,
  terminal), isolated to the machine owner, not to a single bot.
- Tool calling through the runtime (never from the desktop straight to vLLM).
- MCP client: stdio and LAN-reachable servers. No requirement that MCP be on
  the public internet.
- Attachments that tools can read; still no default VL unless a VL checkpoint
  is explicitly configured.

## v2 — skills, routines, widgets

- Skills as durable how-to documents a bot can load.
- Routines: assign a skill to a bot on a schedule or an event.
- “Teach a task”: record a demonstration on the sandbox computer, draft a
  skill, human reviews.
- Question widgets in the transcript (approve / pick / short answer) so a bot
  can stop for judgment without dumping a wall of text.

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
