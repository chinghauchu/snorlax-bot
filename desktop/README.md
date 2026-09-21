# Desktop client

TypeScript + Tauri shell for Snorlax-Bot. The web UI is the product; Tauri
is the native window. Talks only to the FastAPI runtime (`/v1`) with a
bearer token. Never talks to oMLX or vLLM.

## Web (no Rust)

Runtime must already be up (see [../runtime/README.md](../runtime/README.md)).

```bash
npm install
npm run dev
```

Open http://127.0.0.1:1420. There is no Connect gate — the chrome
(sidebar, chat, computer pane) is always on screen. Click the **Local**
chip (sidebar footer) and paste the Runtime URL plus token under
Settings → General.

- Prefill `SNORLAX_URL` / `SNORLAX_TOKEN` if those env vars are set.
- Loopback is first-class: `http://127.0.0.1:8787` and `http://localhost:8787`
  save and survive reload.
- Otherwise leave the fields empty. Placeholder: `http://<spark-lan>:8787`
  (hint for a phone on the Spark LAN; not a ban on loopback).
- Health (`GET /v1/health`) is unauthenticated and does not unlock send.
  The composer stays disabled until both URL and token are present.

Mac-local runtime + oMLX: [../docs/mac-local.md](../docs/mac-local.md).

## Native window

Requires a Rust toolchain and Tauri system deps.

```bash
npm install
npm run tauri dev
```

v0 chrome: 256px agent sidebar, chat, 320px computer pane (file tree +
text preview; collapsible, default open), 320px identity overlay on the
chat (not a fourth column), Settings. The agent overlay shows a 288×180
16:10 computer preview above Routines. When `hasSandbox`, a trailing
12px **Open** (and a pointer-cursor shot) opens a takeover overlay on
chat + the info pane (sidebar stays). 52px bar: 24px avatar + name,
12px muted `You're driving · agent paused`, trailing primary **Done**
36px. Esc = Done. Composer is inert while driving. Empty `No computer
yet.` has no Open. While driving, 12px muted **Record** sits left of
Done. Recording swaps that control to `--danger` **Stop** plus a 6px
danger dot (static if Reduce Motion); Done is disabled. Stop opens a
320px **Save as skill** sheet. iOS stays preview-only (no tap-to-open,
no Record).
Create agent or channel from +.
Muted 12px tool traces (`Searching…` / `Wrote app.py` / `Used server__tool`) may appear in
the transcript while the runtime runs tools (including MCP). Agent info
pane lists cron routines (44px rows, live enable/pause switch, 12px Add /
Remove). Webhook
rows show muted `Webhook` plus Copy for the URL. Slack/GitHub rows
(when that plugin is connected) show `Slack #eng` / `GitHub owner/name`
with no Copy. The Add-routine sheet adds Slack/GitHub segments only
when connected (one 12px row; `#eng` / `owner/name`). Below that, Skills
(44px rows, trailing 12px Add, 12px muted Edit then Remove; 320px
`New skill` and Edit skill source sheets). Below Skills, Memory
(12px muted header, no Add; 14px / 1.2 facts clamp to 2 lines, min 44px
rows, hover title is the full fact, trailing 12px muted Remove; confirm
`Remove this memory?`; empty `No memories yet.`; open pane refetches
after Remembered / Forgot). Settings
lists runtime plugins (`Connected` / `Needs sign-in`; Add / Remove) plus a
curated Catalog (Slack/GitHub trailing Add; hide header when empty).
The 1:1 composer `/` at a token start reuses the `@` typeahead overlay
(240px, `--bg-elevated`, 8px radius, 36px rows, 14px name, no avatar).
Pick inserts `/name` as plain text; Send loads SKILL.md. Channel `/` is
plain text (no popup). Empty list or no match: no popup.
Composer paperclip stays; desktop also drop onto the composer (accent
1px highlight). Pending chips wrap above the bar (56×56 image thumb;
36px file chip). Send is on if there’s text or any chip. User-right
images stay 220×160; files are 36px name chips that open the Bearer
URL. v0.26: LEFT `kind=message` reuses that chrome (above markdown,
6px gap). v0.27: video drop/pick is a 56×56 pending poster (grey +
16px play if no frame); transcript player 220×160, 8px radius, 1px
border, poster + 24px play, no autoplay, native controls after click.
v0.28: no chrome; `watch_video` is the existing 12px muted `Watched {name}`
tool line (no Watch button, no second player).
v0.30: composer clipboard paste (Cmd-V / Ctrl-V and the `paste` event)
fills those same pending chips; bitmap with no filename is `image.png`
(jpeg / gif / webp extensions); text-only paste stays in the textarea.
`@` and `/` unchanged.
v0.31: Copy on completed LEFT `kind=message` (12px muted row after
attachments + markdown; `Copied` for 1.5s). Regenerate 1:1 only on the
latest completed LEFT `kind=message` (`{ regenerate: true }`). Channel
has Copy, no Regenerate. Fenced-code Copy stays.
v0.32: dedicated `kind=approve` LEFT card for mutating shell (not a
WidgetCard fork). 240–320px, 12px radius/padding. Command is 12px/1.45
mono, max 2 lines, hover title is the full command. Approve / Deny / ×.
v0.41: composer mic (idle / recording / processing) records audio,
POSTs `/v1/transcribe`, and inserts editable plain text at the
caret. No auto-send. Local whisper.cpp only — see
[docs/mac-local.md](../docs/mac-local.md).
v0.44: muted 12px Speak on completed LEFT `kind=message` (same
row as Copy / Regenerate). Idle Speak; while playing Stop
speaking. POSTs `/v1/speak` and plays the WAV. No autoplay.
Local piper only — see [docs/mac-local.md](../docs/mac-local.md).
v0.45: fenced `mermaid` on completed LEFT `kind=message` renders
as an inline diagram (official mermaid). Invalid / failed parse
falls back to fence chrome. Streaming stays code until complete.
Speak treats mermaid fences like other fences.
v0.46: TeX math on completed LEFT `kind=message` (inline `\( \)`
/ block `$$`; KaTeX). Invalid / failed parse falls back to
monospace source. Streaming defers until complete. Speak treats
math as plain TeX source. Single `$` is not math.
v0.47: stick-to-bottom while streaming. Within ~64px of the
bottom, follow tokens. Scroll up freezes. Send / Regenerates
snap and re-arm. New assistant bubble while stuck: 12px muted
Jump to latest chip at the bottom of the chat column. Composer
focus stays after Send.
v0.48: completed LEFT `kind=message` splits on blank lines
into short multi-bubbles (Grok Bot feel). Mid-stream stays
one growing bubble. Copy / Speak / Regenerates only on the
last bubble of that turn. OpenAPI stays 0.18.0.
v0.49: optimistic user-RIGHT bubble on Send (Grok Bot feel).
Paint text + pending chips immediately; upload first; block
a second Send until the round-trip settles. On success,
reconcile with the server/turn message (no duplicate). On
4xx/5xx, restore text + chips and show a muted 12px
Couldn't send. hint. Regenerates unchanged. OpenAPI stays
0.18.0.
v0.50: Stop generating mid-stream (Grok Bot feel). While an
assistant LEFT turn is streaming, a 12px muted Stop sits at
the bottom of the chat column (above Jump to latest if both
show). Click aborts the in-flight stream; stop appending
tokens; the partial LEFT stays as completed. Hide Stop when
idle. Composer stays focused. OpenAPI stays 0.18.0.
v0.51: waiting ··· until first token (Grok Bot feel). After
Send, a 12px muted pulsing ··· sits on the LEFT (not a tool
line, not a bubble) until the first assistant token. First
token swaps to the growing LEFT bubble. Stop / error /
empty reply dismisses the dots. OpenAPI stays 0.18.0.
v0.52: streaming caret on the growing LEFT bubble (Grok Bot
feel). After the first assistant token and until complete /
Stop, a 12px muted blinking caret sits at the end of the
mid-stream LEFT text. On complete / Stop the caret is gone
immediately. Waiting ··· stays pre-first-token only; never
both. Reduce Motion: static muted caret. Not on tool /
widget / approve / connect / user-right. OpenAPI stays 0.18.0.
v0.53: Esc = Stop while generating (Grok Bot feel). While an
assistant LEFT turn is in flight, window Esc aborts the
in-flight stream — same as tapping Stop. Do not steal Esc
when IME is composing, or when a pending widget / approve /
connect card is up. No new chrome. OpenAPI stays 0.18.0.
v0.54: same-turn multi-bubble gap (Grok Bot feel).
Consecutive LEFT bubbles from the same completed turn
(blank-line split) use a 6px gap. Different turns / after
tool / widget / approve / connect stay 12px. Mid-stream
(one growing bubble) unchanged. User-right unchanged.
OpenAPI stays 0.18.0.
v0.55: Send muted while generating (Grok Bot feel). While
an assistant LEFT turn is in flight, Send is muted and
disabled; Enter does not send. Composer text stays
editable (draft the next message). Stop + Esc unchanged.
On complete / Stop / error / empty, Send re-enables
immediately. OpenAPI stays 0.18.0.
v0.56: compact tool traces (Grok Bot feel). Within one
assistant turn, 2+ consecutive kind=tool lines collapse
to one 12px muted `N tools` line with a small chevron.
Default collapsed. Click expands to the existing per-tool
lines; click again collapses. Single tool unchanged. Live:
first tool paints normally; on the 2nd, swap to collapsed
`N tools` and bump N. kind=widget / approve / connect
never fold. Stick-to-bottom / Jump / multi-bubble gap
unchanged. OpenAPI stays 0.18.0.
v0.57: mid-stream plaintext (Grok Bot feel). While a LEFT
kind=message is mid-stream (growing bubble + caret), paint
plain text only — no live markdown, mermaid, or math. On
complete or Stop (partial stays completed): render markdown
once (bold/lists/code/links + mermaid + math), then the
blank-line multi-bubble split. Copy / Speak / Regenerates
still only on the last bubble after complete. ··· waiting,
caret, stick-to-bottom, compact tools unchanged. OpenAPI
stays 0.18.0.
v0.58: Reduce Motion static ··· (Grok Bot feel). When the
OS Reduce Motion setting is on, waiting ··· is static
muted (no pulse). When off, keep the existing pulse.
Streaming caret Reduce Motion is already static (v0.52).
Appear/dismiss rules for ··· unchanged. OpenAPI stays
0.18.0.
Assistant LEFT
`kind=message` is 14px markdown (16/14 headings) in short
agent bubbles after complete; user-right stays plain (`https://` tappable). Fenced code is full-turn language + Copy at 12px/1.45.
iOS has no file-tree computer pane; the agent sheet shows the same preview.

Types and the `/v1` client are generated from the locked camelCase OpenAPI
(`openapi.yaml`, same contract as `protocol/openapi.yaml` on the Backend
contract PR). Regenerate with `npm run generate:api`.
