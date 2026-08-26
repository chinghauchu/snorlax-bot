# Next tickets

Concrete follow-ups after v0. Filed on GitHub against
[chinghauchu/snorlax-bot](https://github.com/chinghauchu/snorlax-bot).

## Product

- [P1 — First-run roster roles without a workflow builder](https://github.com/chinghauchu/snorlax-bot/issues/2)
- [P2 — Question widgets: approve, pick, short answer](https://github.com/chinghauchu/snorlax-bot/issues/3) — **v0.8:** runtime-owned `kind=widget` LEFT card; POST `widgetReply: { id, values?, dismissed? }` (not a user bubble); dismiss does not wake; 409 unless `dismissOnMoveOn`; thread-only in channels. Not a tool-approval card.
- [P3 — Skills vs routines object model](https://github.com/chinghauchu/snorlax-bot/issues/4) — **v0.9:** one routine = one agent + one SKILL.md; GET `{ id, name, skill, schedule, enabled }`; PATCH `{ enabled }`; chrome is list + enable/pause only (no create/edit/delete UI, no teach-a-task, no marketplace). **v0.13:** cron XOR trigger; GET `kind` + webhook URL (token in path) + Copy; `POST {webhookUrl}` (no Bearer; 204; paused/unknown 404).
- [P4 — Shared sandbox computer threat model](https://github.com/chinghauchu/snorlax-bot/issues/5)

## Design

- [D1 — Desktop visual system: roster, status, empty states](https://github.com/chinghauchu/snorlax-bot/issues/11)
- [D2 — Computer pane next to chat](https://github.com/chinghauchu/snorlax-bot/issues/12) — v0.6 first slice: 320px right file tree + text preview over the existing `~/.snorlax-bot` workspace (collapsible, default open). **v0.14:** identity-pane 16:10 Bearer PNG preview (288×180); not VNC / take-over / click API. File-tree column unchanged.
- [D3 — In-stream widgets and attachment chips](https://github.com/chinghauchu/snorlax-bot/issues/8) — **v0.8 first slice:** LEFT question card chrome (desktop + iOS, no extra sheet). Attachment-chip VL treatment stays later.

## Backend

- [B1 — vLLM on GB10 70B FP8 recipe](https://github.com/chinghauchu/snorlax-bot/issues/10)
- [B2 — Runtime-owned tool loop](https://github.com/chinghauchu/snorlax-bot/issues/14) — v0.5 built-in files/shell/web in a `~/.snorlax-bot` sandbox (not a Mac folder picker); shell has no extra network; tools auto-run; search provider is env/config; MCP stays later; computer pane first slice is v0.6
- [B3 — MCP client: stdio and LAN, not public internet](https://github.com/chinghauchu/snorlax-bot/issues/15) — v0.7: FastAPI is the MCP client; `mcp.json` under `SNORLAX_DATA_DIR`; stdio + LAN HTTP/SSE; namespaced `server__tool`; built-ins win; desktop/iOS never speak MCP. **v0.10:** `GET /v1/plugins` + `POST .../auth` + `kind=connect` chrome (Settings list; OS browser). **v0.12:** Settings Add custom (`POST /v1/plugins`, `DELETE .../{id}`; no separate disconnect). No marketplace catalog.
- [B4 — Local sandbox computer on the Spark](https://github.com/chinghauchu/snorlax-bot/issues/7) — v0.6 first slice: GET list/read of the existing tool sandbox (same `workspace_for()` roots). **v0.14:** per-agent 1280×800 display + `GET /v1/agents/{id}/computer` Bearer PNG. Full B4 (browser, per-agent VNC, 128GB Spark VM, take-over) stays later
- [B5 — Scheduler for routines while the laptop is closed](https://github.com/chinghauchu/snorlax-bot/issues/17) — **v0.9:** FastAPI-process scheduler, cron in Asia/Taipei; a due run writes a normal assistant Message in that agent's 1:1 (`senderId=A`, `kind=message`, optional `routineName`). Isolation stands. **v0.13:** webhook fire is the same 1:1 path; pause still stops fire.
- [B6 — Agent-to-agent messages and group threads](https://github.com/chinghauchu/snorlax-bot/issues/18) — v0.1 isolation + v0.2 handoff threads / jump chip + v0.4 report-back and extra channels

## Frontend

- [F1 — Streaming markdown without flicker](https://github.com/chinghauchu/snorlax-bot/issues/6) — **v0.11:** clients render assistant LEFT `kind=message` as 14px markdown (no grey bubble; 16/14 headings); user-right stays plain (`https://` tappable); fenced code full-turn language + Copy at 12px/1.45; inline code 13px / 4px / accent 18%. Content stays a plain string (no new Message fields). Mermaid / math / raw HTML out of scope.
- [F2 — Pairing: local token file and LAN paste](https://github.com/chinghauchu/snorlax-bot/issues/16)
- [F3 — Edit agent name and instructions in the desktop UI](https://github.com/chinghauchu/snorlax-bot/issues/19) — v0.3 identity pane PATCHes name/title/description/avatar (no `instructions` field)
- Attachment chips with “not sent to model” already exist in v0; VL-on
  treatment stays with D3.
- Computer pane first slice is v0.6 (D2/B4): desktop file tree + preview over
  `~/.snorlax-bot` workspaces. **v0.14:** identity-pane screenshot preview.
  Full sandbox computer GUI (browser, VNC, terminal, take-over) stays later.

## iOS

- [I1 — `/v1` URLSession SSE client](https://github.com/chinghauchu/snorlax-bot/issues/13)
- [I2/I3 — Pairing, roster, and chat on the LAN](https://github.com/chinghauchu/snorlax-bot/issues/9)
- Background-safe send is part of I1: runtime keeps generating; iOS
  reconnects to `GET /v1/agents/{id}/messages`.
