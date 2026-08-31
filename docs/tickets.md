# Next tickets

Concrete follow-ups after v0. Filed on GitHub against
[chinghauchu/snorlax-bot](https://github.com/chinghauchu/snorlax-bot).

## Product

- [P1 — First-run roster roles without a workflow builder](https://github.com/chinghauchu/snorlax-bot/issues/2)
- [P2 — Question widgets: approve, pick, short answer](https://github.com/chinghauchu/snorlax-bot/issues/3) — **v0.8:** runtime-owned `kind=widget` LEFT card; POST `widgetReply: { id, values?, dismissed? }` (not a user bubble); dismiss does not wake; 409 unless `dismissOnMoveOn`; thread-only in channels. Not a tool-approval card. **v0.32:** mutating shell is a dedicated `kind=approve` card (not a widget fork); POST `approveReply: { id, approved: true }` or `{ dismissed: true }`; read-only ls/cat/pwd/git status|log|diff auto-run; OpenAPI stays 0.18.0. **v0.33:** create/delete routine confirm reuses `kind=widget` (Save / Don't, Remove / Keep); not a new kind.
- [P3 — Skills vs routines object model](https://github.com/chinghauchu/snorlax-bot/issues/4) — **v0.9:** one routine = one agent + one SKILL.md; GET `{ id, name, skill, schedule, enabled }`; PATCH `{ enabled }`; chrome is list + enable/pause only (no create/edit/delete UI, no marketplace). **v0.13:** cron XOR trigger; GET `kind` + webhook URL (token in path) + Copy; `POST {webhookUrl}` (no Bearer; 204; paused/unknown 404). **v0.16:** desktop teach-a-task writes SKILL.md from a takeover recording (`POST /skills { name }`; v0.9 list, no extra chrome). **v0.17:** identity-pane Add / Remove; `DELETE .../routines/{id}` 204; POST cron XOR webhook; GET skills `{ id, name }` (channel 409); Slack/GitHub POST 422. **v0.18:** identity-pane Skills below Routines; GET/PATCH/DELETE `/skills/{sid}`; GET `{ id, name, body }` is full SKILL.md source (frontmatter plus recipe); no blank Add. **v0.21:** 1:1 composer `/` autocomplete (existing `@` overlay + `GET /skills`); Send injects that SKILL.md; unknown `/foo` and channel `/` stay plain text; no new HTTP; OpenAPI stays 0.18.0. **v0.22:** blank New skill; Skills header Add; 320px `New skill` sheet; same POST two bodies `{ name, body }` (no capture) vs `{ name }` record path; OpenAPI stays 0.18.0. **v0.23:** Slack/GitHub inbound listeners; POST `{ type: slack, channel }` / `{ type: github, repo }` 201 when that plugin is connected; unconnected/empty/wildcards 422; GET omits unless connected; fire 1:1 as A; Add-routine Slack/GitHub segments only when connected; OpenAPI stays 0.18.0. **v0.35:** new agents copy seed SKILL.md (teammates 项目/员工 + routines 定时/提醒) into their workspace; startup backfill for existing agents; `create_agent` / `create_channel` / `create_routine` stay in the tool list whenever tools are on (not skill-gated); OpenAPI stays 0.18.0.
- [P4 — Shared sandbox computer threat model](https://github.com/chinghauchu/snorlax-bot/issues/5)

## Design

- [D1 — Desktop visual system: roster, status, empty states](https://github.com/chinghauchu/snorlax-bot/issues/11)
- [D2 — Computer pane next to chat](https://github.com/chinghauchu/snorlax-bot/issues/12) — v0.6 first slice: 320px right file tree + text preview over the existing `~/.snorlax-bot` workspace (collapsible, default open). **v0.14:** identity-pane 16:10 Bearer PNG preview (288×180). **v0.15:** desktop Open / Done takeover overlay (no VNC / separate window). **v0.16:** Record / Stop / Save as skill on that takeover bar (desktop). **v0.19:** iOS Open / Done full-screen takeover (same v0.15 session). **v0.20:** iOS Record / Stop / Save as skill on that takeover bar (same v0.16 record protocol). **v0.34:** one 12px seam chevron (› collapse / ‹ expand). Default collapsed (`256px 1fr`, min 720). Desktop-wide persisted flag. No ComputerIcon toggle. File-tree column otherwise unchanged. iOS still has no file-tree pane.
- [D3 — In-stream widgets and attachment chips](https://github.com/chinghauchu/snorlax-bot/issues/8) — **v0.8 first slice:** LEFT question card chrome (desktop + iOS, no extra sheet). **v0.25:** user-right attachment chips (composer paperclip / drop; 56×56 pending image; 36px file chip; GET `attachments` on user-right; `attachmentIds` in that turn). **v0.26:** LEFT `kind=message` reuses that chrome (above markdown, 6px gap; not on tool / widget / Connect / timeline handoff). **v0.27:** video (56×56 pending poster; 220×160 player, native controls, no autoplay; 50MB). **v0.28:** `watch_video` is the existing 12px muted `Watched {name}` tool line (no Watch button, no second player; desktop/iOS idle). **v0.29:** `create_agent` / `create_channel` paint as that same 12px muted `Created {name}` tool line (not a card). Composer Enter does not send while IME is composing. **v0.30:** composer clipboard paste fills those same pending chips (Cmd-V / Ctrl-V / `paste` / UIPasteboard); text-only paste stays in the field; paperclip and drop unchanged. **v0.31:** Copy on completed LEFT `kind=message` (1:1 and channel; 12px muted row; `Copied` 1.5s). Regenerate 1:1 only on the latest completed LEFT `kind=message` (`{ regenerate: true }`). **v0.32:** dedicated `kind=approve` LEFT card for mutating shell (240–320px; Approve / Deny / ×; not a WidgetCard fork).

## Backend

- [B1 — vLLM on GB10 70B FP8 recipe](https://github.com/chinghauchu/snorlax-bot/issues/10)
- [B2 — Runtime-owned tool loop](https://github.com/chinghauchu/snorlax-bot/issues/14) — v0.5 built-in files/shell/web in a `~/.snorlax-bot` sandbox (not a Mac folder picker); shell has no extra network; tools auto-run; search provider is env/config; MCP stays later; computer pane first slice is v0.6. **v0.28:** built-in `watch_video` `{ attachmentId }` (auto-run; conversation-scoped; text description; `Watched {name}`; no auto-inject). **v0.29:** `create_agent` / `create_channel` wrap existing `POST /v1/agents` (`Created {name}`; empty name / unknown memberIds are tool errors; user POST stays 200). **v0.32:** mutating `shell` pauses on `kind=approve`; read-only ls/cat/pwd/git status|log|diff still auto-run; other tools stay auto-run. **v0.33:** `create_routine` / `pause_routine` / `delete_routine` wrap existing routine HTTP; create/delete confirm on `kind=widget`; pause auto-runs; OpenAPI stays 0.18.0. **v0.35:** new-agent seed SKILL.md copy plus startup backfill; `create_agent` / `create_channel` / `create_routine` always in the tool list when tools are on (not skill-gated); OpenAPI stays 0.18.0.
- [B3 — MCP client: stdio and LAN, not public internet](https://github.com/chinghauchu/snorlax-bot/issues/15) — v0.7: FastAPI is the MCP client; `mcp.json` under `SNORLAX_DATA_DIR`; stdio + LAN HTTP/SSE; namespaced `server__tool`; built-ins win; desktop/iOS never speak MCP. **v0.10:** `GET /v1/plugins` + `POST .../auth` + `kind=connect` chrome (Settings list; OS browser). **v0.12:** Settings Add custom (`POST /v1/plugins`, `DELETE .../{id}`; no separate disconnect). **v0.24:** curated catalog `GET /v1/plugins/catalog` (Slack/GitHub; omit when installed; Catalog Add is the same POST; not a store / search).
- [B4 — Local sandbox computer on the Spark](https://github.com/chinghauchu/snorlax-bot/issues/7) — v0.6 first slice: GET list/read of the existing tool sandbox (same `workspace_for()` roots). **v0.14:** per-agent 1280×800 display; `GET /v1/agents/{id}/computer` `{ hasSandbox, width, height, imageUrl }`; `imageUrl` is Bearer PNG at `/computer/screenshot`. Channel 409. Missing agent 404. **v0.15:** `POST /computer/session` 201 `{ sessionId }`; `DELETE .../session` or `DELETE .../session/{sessionId}` 204; `POST .../pointer` `{ x, y, type }` + `POST .../key` `{ key, type, text? }` while the session is up (200); GET may include `driving`; agent-driven sandbox tools 409. Channel 409. **v0.16:** `POST /computer/record` 201 `{ recording: true }` (409 without session / already recording); `DELETE .../record` 204 (no SKILL.md); `POST /skills { name }` 201 Skill `{ id, name }` (422 empty name / no pending capture); GET may include `recording` when hasSandbox. Full B4 (browser, per-agent VNC, 128GB Spark VM) stays later
- [B5 — Scheduler for routines while the laptop is closed](https://github.com/chinghauchu/snorlax-bot/issues/17) — **v0.9:** FastAPI-process scheduler, cron in Asia/Taipei; a due run writes a normal assistant Message in that agent's 1:1 (`senderId=A`, `kind=message`, optional `routineName`). Isolation stands. **v0.13:** webhook fire is the same 1:1 path; pause still stops fire. **v0.17:** `DELETE .../routines/{id}` 204 (unknown 404; channel 409); POST still cron XOR webhook (Slack/GitHub trigger 422); GET skills `{ id, name }` (empty 200 `[]`; channel 409). **v0.18:** GET/PATCH/DELETE `/v1/agents/{id}/skills/{sid}` (body is full SKILL.md source including frontmatter; write in place, prefer keep id; DELETE does not cascade-delete routines; empty name/body 422; unknown 404; channel 409). **v0.21:** 1:1 `/name` load path injects that SKILL.md into the turn; unknown `/foo` and channel `/` stay plain text; no new HTTP; OpenAPI stays 0.18.0. **v0.22:** same POST `/skills`, two bodies — `{ name, body }` writes SKILL.md (no capture, 201 `{ id, name }`); `{ name }` omitted body stays record path; empty name/body 422; channel 409; OpenAPI stays 0.18.0. **v0.23:** Slack/GitHub MCP events fire `fire_routine_now` into that agent's 1:1 (pause skips); POST slack/github 201 when connected; OpenAPI stays 0.18.0. **v0.35:** new agents copy seed teammates + routines SKILL.md into their workspace; startup backfill; create tools stay in the tool list whenever tools are on (not skill-gated); OpenAPI stays 0.18.0.
- [B6 — Agent-to-agent messages and group threads](https://github.com/chinghauchu/snorlax-bot/issues/18) — v0.1 isolation + v0.2 handoff threads / jump chip + v0.4 report-back and extra channels

## Frontend

- [F1 — Streaming markdown without flicker](https://github.com/chinghauchu/snorlax-bot/issues/6) — **v0.11:** clients render assistant LEFT `kind=message` as 14px markdown (no grey bubble; 16/14 headings); user-right stays plain (`https://` tappable); fenced code full-turn language + Copy at 12px/1.45; inline code 13px / 4px / accent 18%. Content stays a plain string (no new Message fields). Mermaid / math / raw HTML out of scope.
- [F2 — Pairing: local token file and LAN paste](https://github.com/chinghauchu/snorlax-bot/issues/16)
- [F3 — Edit agent name and instructions in the desktop UI](https://github.com/chinghauchu/snorlax-bot/issues/19) — v0.3 identity pane PATCHes name/title/description/avatar (no `instructions` field)
- Attachment chips: **v0.25** user-right composer + transcript (paperclip /
  drop; `POST /v1/agents/{id}/attachments` + `attachmentIds`; images in
  that turn; legacy `images[]` stay off-model). **v0.26:** LEFT
  `kind=message` reuses that chrome (runtime binds write_file /
  screenshot). **v0.27:** video drop/pick; 56×56 pending poster; 220×160
  player (8px/8pt radius, 1px/1pt border, 24px/24pt play, no autoplay);
  `kind=video`; 50MB; not fed to the model. **v0.28:** `watch_video` is the
  existing 12px muted `Watched {name}` tool line (no Watch button, no
  second player; desktop/iOS idle). **v0.29:** `create_agent` /
  `create_channel` are that same 12px muted `Created {name}` line;
  composer Enter does not send while IME is composing. **v0.30:**
  composer clipboard paste (Cmd-V / Ctrl-V / paste event /
  UIPasteboard) fills those same pending chips; text-only paste stays
  in the field; paperclip and drop unchanged. **v0.31:** Copy on
  completed LEFT `kind=message`; Regenerate on the latest 1:1
  assistant message (`POST { regenerate: true }`).
- Computer pane first slice is v0.6 (D2/B4): desktop file tree + preview over
  `~/.snorlax-bot` workspaces. **v0.14:** identity-pane screenshot preview.
  **v0.15:** desktop Open / Done takeover (pointer/key in 1280×800). **v0.16:**
  Record / Stop / Save as skill inside that overlay. **v0.18:** identity-pane
  Skills list + 320px Edit skill source sheet (desktop + iOS). **v0.19:**
  iOS Open / Done full-screen takeover (v0.15 session protocol). **v0.20:**
  iOS Record / Stop / Save as skill on that takeover bar (v0.16 record
  protocol). **v0.21:** 1:1 composer `/` skill autocomplete (reuse `@`
  overlay; 240px / 240pt; 36px / 44pt rows; name 14px / 14pt; no avatar;
  insert is `/name` plain text). **v0.22:** identity-pane Skills Add +
  320px `New skill` source sheet (desktop + iOS); `POST { name, body }`.
  **v0.23:** Add-routine Slack/GitHub segments only when that MCP plugin
  is connected (one 12px row; omit, do not disable); Slack `#eng` /
  GitHub `owner/name`; Copy stays webhook-only. Full sandbox computer GUI
  (browser, VNC, terminal)
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
  `Record` left of `Done`; Keyboard stays trailing; Stop is `--danger`
  + 6pt dot; Done disabled while recording; **no Esc**; Save sheet is
  Edit-skill family, 14pt name, 44pt Save; × / Cancel discards). Same
  v0.16 HTTP. Record only inside a takeover session. No blank New skill.
- **v0.21:** 1:1 composer `/` skill autocomplete (same `@` overlay family:
  240pt, 8pt radius, 44pt rows, 14pt name, no avatar). Channel `/` is
  plain text. Insert is `/name` text, not a chip. Empty / no match: no
  popup.
- **v0.22:** identity-pane Skills trailing 12pt Add; empty still shows
  Add; 320pt-family `New skill` sheet (Name 14pt; TextEditor 12pt/1.45
  mono, min-height 200pt; primary Add 44pt disabled until name AND
  body). `POST { name, body }`. Record-to-skill `{ name }` stays.
- **v0.23:** Add-routine Slack/GitHub segments only when that plugin is
  connected (omit, do not disable). Slack 14pt `#eng` + 12pt `Channel
  the bot is in.`; GitHub `owner/name` + `One repo. No wildcards.`
  Primary Add 44pt. Copy stays webhook-only. No event picker.
- **v0.30:** composer paste from UIPasteboard (images / videos / files)
  fills the same pending chips as paperclip. Plain text paste stays in
  the text field. Same 10MB / 50MB danger copy. Photos/Files paperclip
  unchanged.
- **v0.31:** Copy on completed LEFT `kind=message` (12pt muted row;
  `Copied` for 1.5s). Regenerate 1:1 only on the latest completed
  LEFT `kind=message` (`{ regenerate: true }`; hidden while sending).
  Channel has Copy, no Regenerate. Fenced-code Copy stays.
