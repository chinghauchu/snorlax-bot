# Next tickets

Concrete follow-ups after v0. Filed on GitHub against
[chinghauchu/snorlax-bot](https://github.com/chinghauchu/snorlax-bot).

## Product

- [P1 — First-run roster roles without a workflow builder](https://github.com/chinghauchu/snorlax-bot/issues/2)
- [P2 — Question widgets: approve, pick, short answer](https://github.com/chinghauchu/snorlax-bot/issues/3) — **v0.8:** runtime-owned `kind=widget` LEFT card; POST `widgetReply: { id, values?, dismissed? }` (not a user bubble); dismiss does not wake; 409 unless `dismissOnMoveOn`; thread-only in channels. Not a tool-approval card.
- [P3 — Skills vs routines object model](https://github.com/chinghauchu/snorlax-bot/issues/4) — **v0.9:** one routine = one agent + one SKILL.md; GET `{ id, name, skill, schedule, enabled }`; PATCH `{ enabled }`; chrome is list + enable/pause only (no create/edit/delete UI, no marketplace). **v0.13:** cron XOR trigger; GET `kind` + webhook URL (token in path) + Copy; `POST {webhookUrl}` (no Bearer; 204; paused/unknown 404). **v0.16:** desktop teach-a-task writes SKILL.md from a takeover recording (`POST /skills { name }`; v0.9 list, no extra chrome). **v0.17:** identity-pane Add / Remove; `DELETE .../routines/{id}` 204; POST cron XOR webhook; GET skills `{ id, name }` (channel 409); Slack/GitHub POST 422. **v0.18:** identity-pane Skills below Routines; GET/PATCH/DELETE `/skills/{sid}`; GET `{ id, name, body }` is full SKILL.md source (frontmatter plus recipe); no blank Add.
- [P4 — Shared sandbox computer threat model](https://github.com/chinghauchu/snorlax-bot/issues/5)

## Design

- [D1 — Desktop visual system: roster, status, empty states](https://github.com/chinghauchu/snorlax-bot/issues/11)
- [D2 — Computer pane next to chat](https://github.com/chinghauchu/snorlax-bot/issues/12) — v0.6 first slice: 320px right file tree + text preview over the existing `~/.snorlax-bot` workspace (collapsible, default open). **v0.14:** identity-pane 16:10 Bearer PNG preview (288×180). **v0.15:** desktop Open / Done takeover overlay (no VNC / separate window). **v0.16:** Record / Stop / Save as skill on that takeover bar (desktop). **v0.19:** iOS Open / Done full-screen takeover (same v0.15 session). **v0.20:** iOS Record / Stop / Save as skill on that takeover bar (same v0.16 record protocol). File-tree column unchanged.
- [D3 — In-stream widgets and attachment chips](https://github.com/chinghauchu/snorlax-bot/issues/8) — **v0.8 first slice:** LEFT question card chrome (desktop + iOS, no extra sheet). Attachment-chip VL treatment stays later.

## Backend

- [B1 — vLLM on GB10 70B FP8 recipe](https://github.com/chinghauchu/snorlax-bot/issues/10)
- [B2 — Runtime-owned tool loop](https://github.com/chinghauchu/snorlax-bot/issues/14) — v0.5 built-in files/shell/web in a `~/.snorlax-bot` sandbox (not a Mac folder picker); shell has no extra network; tools auto-run; search provider is env/config; MCP stays later; computer pane first slice is v0.6
- [B3 — MCP client: stdio and LAN, not public internet](https://github.com/chinghauchu/snorlax-bot/issues/15) — v0.7: FastAPI is the MCP client; `mcp.json` under `SNORLAX_DATA_DIR`; stdio + LAN HTTP/SSE; namespaced `server__tool`; built-ins win; desktop/iOS never speak MCP. **v0.10:** `GET /v1/plugins` + `POST .../auth` + `kind=connect` chrome (Settings list; OS browser). **v0.12:** Settings Add custom (`POST /v1/plugins`, `DELETE .../{id}`; no separate disconnect). No marketplace catalog.
- [B4 — Local sandbox computer on the Spark](https://github.com/chinghauchu/snorlax-bot/issues/7) — v0.6 first slice: GET list/read of the existing tool sandbox (same `workspace_for()` roots). **v0.14:** per-agent 1280×800 display; `GET /v1/agents/{id}/computer` `{ hasSandbox, width, height, imageUrl }`; `imageUrl` is Bearer PNG at `/computer/screenshot`. Channel 409. Missing agent 404. **v0.15:** `POST /computer/session` 201 `{ sessionId }`; `DELETE .../session` or `DELETE .../session/{sessionId}` 204; `POST .../pointer` `{ x, y, type }` + `POST .../key` `{ key, type, text? }` while the session is up (200); GET may include `driving`; agent-driven sandbox tools 409. Channel 409. **v0.16:** `POST /computer/record` 201 `{ recording: true }` (409 without session / already recording); `DELETE .../record` 204 (no SKILL.md); `POST /skills { name }` 201 Skill `{ id, name }` (422 empty name / no pending capture); GET may include `recording` when hasSandbox. Full B4 (browser, per-agent VNC, 128GB Spark VM) stays later
- [B5 — Scheduler for routines while the laptop is closed](https://github.com/chinghauchu/snorlax-bot/issues/17) — **v0.9:** FastAPI-process scheduler, cron in Asia/Taipei; a due run writes a normal assistant Message in that agent's 1:1 (`senderId=A`, `kind=message`, optional `routineName`). Isolation stands. **v0.13:** webhook fire is the same 1:1 path; pause still stops fire. **v0.17:** `DELETE .../routines/{id}` 204 (unknown 404; channel 409); POST still cron XOR webhook (Slack/GitHub trigger 422); GET skills `{ id, name }` (empty 200 `[]`; channel 409). **v0.18:** GET/PATCH/DELETE `/v1/agents/{id}/skills/{sid}` (body is full SKILL.md source including frontmatter; write in place, prefer keep id; DELETE does not cascade-delete routines; empty name/body 422; unknown 404; channel 409).
- [B6 — Agent-to-agent messages and group threads](https://github.com/chinghauchu/snorlax-bot/issues/18) — v0.1 isolation + v0.2 handoff threads / jump chip + v0.4 report-back and extra channels

## Frontend

- [F1 — Streaming markdown without flicker](https://github.com/chinghauchu/snorlax-bot/issues/6) — **v0.11:** clients render assistant LEFT `kind=message` as 14px markdown (no grey bubble; 16/14 headings); user-right stays plain (`https://` tappable); fenced code full-turn language + Copy at 12px/1.45; inline code 13px / 4px / accent 18%. Content stays a plain string (no new Message fields). Mermaid / math / raw HTML out of scope.
- [F2 — Pairing: local token file and LAN paste](https://github.com/chinghauchu/snorlax-bot/issues/16)
- [F3 — Edit agent name and instructions in the desktop UI](https://github.com/chinghauchu/snorlax-bot/issues/19) — v0.3 identity pane PATCHes name/title/description/avatar (no `instructions` field)
- Attachment chips with “not sent to model” already exist in v0; VL-on
  treatment stays with D3.
- Computer pane first slice is v0.6 (D2/B4): desktop file tree + preview over
  `~/.snorlax-bot` workspaces. **v0.14:** identity-pane screenshot preview.
  **v0.15:** desktop Open / Done takeover (pointer/key in 1280×800). **v0.16:**
  Record / Stop / Save as skill inside that overlay. **v0.18:** identity-pane
  Skills list + 320px Edit skill source sheet (desktop + iOS). **v0.19:**
  iOS Open / Done full-screen takeover (v0.15 session protocol). **v0.20:**
  iOS Record / Stop / Save as skill on that takeover bar (v0.16 record
  protocol). Full sandbox computer GUI (browser, VNC, terminal)
  stays later.

## iOS

- [I1 — `/v1` URLSession SSE client](https://github.com/chinghauchu/snorlax-bot/issues/13)
- [I2/I3 — Pairing, roster, and chat on the LAN](https://github.com/chinghauchu/snorlax-bot/issues/9)
- Background-safe send is part of I1: runtime keeps generating; iOS
  reconnects to `GET /v1/agents/{id}/messages`.
- **v0.19:** agent-sheet Computer **Open** is a full-screen takeover
  (12pt Open when `hasSandbox`; 16:10 shot also Opens; Keyboard maps to
  `POST …/key`; Done `DELETE` session). Channel 409.
- **v0.20:** takeover bar **Record / Stop / Save as skill** (12pt muted
  `Record` left of `Done`; Stop is `--danger` + 6pt dot; Done disabled
  while recording; Save sheet; × / Cancel discards). Same v0.16 HTTP.
  Record only inside a takeover session. No blank New skill.
