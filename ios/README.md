# iOS companion

Snorlax-Bot’s phone client. SwiftUI, iOS 18+, same locked `/v1` camelCase
contract as desktop. Named agents, streaming transcript, muted tool traces,
image previews that are **never** sent to the model via legacy
`images[]`. v0.25 `attachmentIds` images **are** included in that turn.
Composer paperclip: Photos or Files. Pending chips wrap above the bar
(56×56 image; 36px file; 44pt hit). User-right images stay 220×160;
files are 36px name chips that open the Bearer URL. v0.26: LEFT
`kind=message` reuses that chrome (above markdown, 6pt gap; not on
tool / widget / Connect / timeline handoff). v0.27: Photos includes
video; pending 56×56 poster (16pt play if no frame); 220×160 player
(8pt radius, 1pt border, 24pt play, no autoplay, AVPlayer inline).
v0.28: no chrome; `watch_video` is the existing 12pt muted `Watched {name}`
tool line (no Watch button, no second player).
v0.29: composer Enter does not send while IME `markedTextRange` is set;
`create_agent` / `create_channel` are the existing 12pt muted
`Created {name}` tool line (roster refreshes on tool.done).
v0.30: composer paste from UIPasteboard fills the same pending chips
as paperclip (images / videos / files); plain text paste stays in the
field. Photos/Files paperclip unchanged.
v0.31: Copy on completed LEFT `kind=message` (12pt muted; `Copied`
1.5s). Regenerate 1:1 only on the latest completed LEFT
`kind=message` (`{ regenerate: true }`). Channel has Copy, no
Regenerate.
v0.43: composer Mic immediately left of Send (paperclip | field |
Mic | Send). Local `POST /v1/transcribe` (multipart `audio`).
Listening is danger + a 6pt solid dot. Cancel while recording does
not POST or insert. Hints `Transcribing…` / `No speech detected.` /
`Microphone is off.` a11y `Start dictation` / `Stop dictation`.
Transcript is editable composer text. No auto-send.
v0.44: Speak on completed LEFT `kind=message` (12pt muted row;
idle Speak / playing Stop speaking). Local `POST /v1/speak`.
Never autoplay. Never AVSpeechSynthesizer / cloud TTS.
v0.45: fenced `mermaid` on completed LEFT `kind=message` renders
via WKWebView + bundled mermaid. Invalid falls back to fence
chrome. Streaming stays code until complete.
v0.46: TeX math on completed LEFT `kind=message` (inline `\( \)`
/ block `$$`) renders via WKWebView + bundled KaTeX. Invalid
falls back to monospace source. Streaming defers until complete.
v0.47: stick-to-bottom while streaming. Within ~64pt of the
bottom, follow tokens. Scroll up freezes. Send / Regenerates
snap and re-arm. New assistant bubble while stuck: 12pt muted
Jump to latest chip. Composer focus stays after Send.
v0.48: completed LEFT `kind=message` splits on blank lines
into short multi-bubbles. Mid-stream stays one growing
bubble. Copy / Speak / Regenerates only on the last bubble
of that turn. OpenAPI stays 0.18.0.
v0.49: optimistic user-RIGHT bubble on Send. Paint text +
pending chips immediately; upload first; block a second
Send until the round-trip settles. On success, reconcile
with the server turn (no duplicate). On 4xx/5xx, restore
text + chips and a muted 12pt Couldn't send. hint.
Regenerates unchanged. OpenAPI stays 0.18.0.
v0.50: Stop generating mid-stream. While an assistant LEFT
turn is streaming, offer a 12pt muted Stop at the bottom of
the chat column (above Jump to latest if both show). Tap
aborts the in-flight stream; stop appending tokens; the
partial LEFT stays as completed. Hide Stop when idle.
Composer stays focused. OpenAPI stays 0.18.0.
v0.51: waiting ··· until first token. After Send, a 12pt
muted pulsing ··· sits on the LEFT (not a tool line, not a
bubble) until the first assistant token. First token swaps
to the growing LEFT bubble. Stop / error / empty reply
dismisses the dots. OpenAPI stays 0.18.0.
v0.52: streaming caret on the growing LEFT bubble. After the
first assistant token and until complete / Stop, a 12pt muted
blinking caret sits at the end of the mid-stream LEFT text.
On complete / Stop the caret is gone immediately. Waiting ···
stays pre-first-token only; never both. Reduce Motion: static
muted caret. Not on tool / widget / approve / connect /
user-right. OpenAPI stays 0.18.0.
v0.53: Esc = Stop while generating. While an assistant LEFT
turn is in flight, hardware Escape (`UIKeyCommand`) aborts
the client stream — same as tapping Stop. Do not steal Esc
while IME is composing (`markedTextRange`) or when a pending
widget / approve / connect card is up. On-screen Stop
unchanged. OpenAPI stays 0.18.0.
v0.54: same-turn multi-bubble gap. Consecutive LEFT bubbles
from the same completed turn (blank-line split) use a 6pt
gap. Different turns / after tool / widget / approve /
connect stay 12pt. Mid-stream (one growing bubble)
unchanged. User-right unchanged. OpenAPI stays 0.18.0.
v0.55: Send muted while generating. While an assistant LEFT
turn is in flight (from Send until complete / Stop / error /
empty), Send is muted and disabled; Enter does not send.
Composer text stays editable (draft the next message). Stop
+ Esc unchanged; IME composing still skips Esc=Stop. On
complete / Stop / error / empty, Send re-enables
immediately. OpenAPI stays 0.18.0.
v0.56: compact tool traces. Within one assistant LEFT
turn, 2+ consecutive kind=tool lines collapse to one 12pt
muted `N tools` line with a small chevron. Default
collapsed. Tap expands to the existing per-tool lines;
tap again collapses. Single tool unchanged. Live: first
tool paints normally; on the 2nd, swap to collapsed
`N tools` and bump N. kind=widget / approve / connect
never fold. Stick-to-bottom / Jump / multi-bubble gap
unchanged. OpenAPI stays 0.18.0.
v0.57: mid-stream plaintext. While a LEFT kind=message is
mid-stream (growing bubble + caret), paint plain text only
— no live markdown, mermaid, or math. On complete or Stop
(partial stays completed): render markdown once
(bold/lists/code/links + mermaid + math), then the
blank-line multi-bubble split. Copy / Speak / Regenerates
still only on the last bubble after complete. ··· waiting,
caret, stick-to-bottom, compact tools unchanged. OpenAPI
stays 0.18.0.
v0.58: Reduce Motion static ···. When the OS Reduce Motion
setting is on, waiting ··· is static muted (no pulse).
When off, keep the existing pulse. Streaming caret Reduce
Motion is already static (v0.52). Appear/dismiss rules for
··· unchanged. OpenAPI stays 0.18.0.
v0.32: dedicated `kind=approve` LEFT card for mutating shell (not a
WidgetCard fork). Approve / Deny / ×; long-press copies the command.
Question widgets
render as LEFT cards in the speaking agent's streak (no extra sheet). Agent
info sheet lists a 16:10 computer preview above routines (12pt labels,
8pt radius, 12pt `Open` when `hasSandbox`; the shot is tappable) then routines (list + enable/pause
+ Copy webhook URL + 12pt Add / Remove with confirm; Slack/GitHub
segments on Add only when that plugin is connected) then skills
(12pt Add / Edit / Remove; Edit skill source sheet; New skill Add sheet)
then Memory (12pt header, no Add; 14pt / 1.2 facts clamp to 2 lines;
long-press copies the full fact; 12pt Remove; confirm `Remove this
memory?`; empty `No memories yet.`; open sheet refetches after
Remembered / Forgot). Composer
`/` on a 1:1 opens the `@` typeahead family (240pt, 8pt radius, 44pt
rows, 14pt name, no avatar); pick inserts `/name` as plain text; Send
loads SKILL.md. Channel `/` is plain text. Empty / no match: no popup.
Full-screen Open
adds Keyboard + Done plus Record / Stop / Save as skill (v0.16 HTTP; discard
writes nothing). Settings lists runtime plugins (Add / Remove; OS browser via
`ASWebAuthenticationSession`) plus a curated Catalog (Slack/GitHub Add;
hide header when empty). No
file-tree computer pane this slice (v0.6 desktop-only). MCP is
runtime-owned; this client never speaks MCP. Connect cards (`kind=connect`)
render as LEFT chrome, not a user bubble. Assistant `kind=message` is 14pt
markdown with no grey bubble (16/14 headings; user-right stays plain,
`https://` tappable). Tool traces (`kind=tool`)
already paint as muted status.

The Spark stays up when the phone sleeps. Reconnect is
`GET /v1/agents/{id}/messages`.

## v0

| | |
| --- | --- |
| Language | Swift 5.9+, SwiftUI |
| Target | iOS 18+ (iPhone + iPad) |
| Network | URLSession, `Authorization: Bearer` on everything except `GET /v1/health` and incoming `POST /v1/hooks/{token}` (token in the path, not the app token) |
| Chat | `POST /v1/agents/{id}/messages` as SSE (`message.delta` / `message.done` / `tool.start` / `tool.done` / `error`) |
| Computer | Agent-sheet 16:10 preview + full-screen Open/Done takeover (v0.15 session) with Record/Stop/Save as skill (v0.16 record). No file browser (desktop-only v0.6) |
| Pairing | Settings sheet. Token in Keychain, URL in AppStorage. No gate screen |
| Seed | `snorlax-bot` (Snorlax / Assistant) and `snorlax-bot-group` (Snorlax-Bot, Channel). Extra user-created channels. Swipe-delete on every row including the seed agent and seed channel (not in the info pane). After seed channel delete, select an agent first if any remain, else a remaining channel; never recreate `snorlax-bot-group`. Empty roster keeps chrome. No jump chip if no channel remains |

Open `SnorlaxBot.xcodeproj` in Xcode. Product name is **SnorlaxBot**; chrome
says **Snorlax-Bot**.

## Pairing

1. Runtime bound to `127.0.0.1:8787` (Mac-local) or `0.0.0.0:8787` (Spark LAN,
   token already on disk).
2. Settings → paste Runtime URL and the bearer token.
   - Mac-local / Simulator: `http://127.0.0.1:8787` or `http://localhost:8787`.
     Loopback is valid and persisted.
   - Phone on the Spark LAN: `http://<spark-lan>:8787` (the field placeholder).
3. Launch with both set: `GET /v1/agents`, select `snorlax-bot`, load
   messages, focus the composer.

URL and token start empty (no silent default). Loopback is allowed when you
paste it. `GET /v1/health` is unauthenticated and does not enable send. The
client never calls oMLX/vLLM (`:8000`).

Mac-local recipe: [../docs/mac-local.md](../docs/mac-local.md).

## `/v1` types

Wire types are generated from [../protocol/openapi.yaml](../protocol/openapi.yaml)
(the locked camelCase `/v1` contract):

```bash
python3 ios/scripts/generate_v1_types.py
python3 ios/scripts/generate_v1_types.py --check
python3 ios/scripts/test_computer_takeover.py
python3 ios/scripts/test_skill_autocomplete.py
python3 ios/scripts/test_blank_new_skill.py
python3 ios/scripts/test_slack_github_routines.py
python3 ios/scripts/test_ios_dictation.py
python3 ios/scripts/test_ios_stop_generating.py
python3 ios/scripts/test_ios_send_muted.py
python3 ios/scripts/test_ios_compact_tools.py
```

Output: `SnorlaxBot/Generated/V1Types.swift`. Do not hand-edit that file.

## Sources

- `SnorlaxBot/SnorlaxBotApp.swift` — entry, theme, accent
- `SnorlaxBot/ContentView.swift` — iPhone stack / iPad split chrome
- `SnorlaxBot/AppModel.swift` — roster, chat, settings persistence
- `SnorlaxBot/Dictation.swift` — v0.43 composer mic helpers + local capture
- `SnorlaxBot/SkillPicker.swift` — v0.21 1:1 composer `/` trigger + filter
- `SnorlaxBot/ProfileSheet.swift` — identity / channel pane; agent routines + skills lists
- `SnorlaxBot/ComputerSession.swift` — v0.19 Open chrome + v0.20 Record chrome + letterbox pointer map
- `SnorlaxBot/ComputerTakeover.swift` — full-screen Open (Keyboard + Done + Record/Stop/Save as skill)
- `SnorlaxBot/SettingsSheet.swift` — URL, token, plugins list + Add sheet
- `SnorlaxBot/ConnectCard.swift` — `kind=connect` LEFT card
- `SnorlaxBot/ApproveCard.swift` — `kind=approve` LEFT card
- `SnorlaxBot/AssistantMarkdown.swift` — assistant LEFT markdown + v0.48 blank-line split + v0.54 6pt same-turn gap
- `SnorlaxBot/MermaidView.swift` — v0.45 WKWebView mermaid (local)
- `SnorlaxBot/mermaid.min.js` — bundled official mermaid (IIFE)
- `SnorlaxBot/MathView.swift` — v0.46 WKWebView KaTeX (local)
- `SnorlaxBot/StickToBottom.swift` — v0.47 stick/freeze/Jump to latest
- `SnorlaxBot/OptimisticSend.swift` — v0.49 optimistic user-RIGHT on Send
- `SnorlaxBot/StopGenerating.swift` — v0.50 12pt muted Stop (client abort); v0.53 Esc = Stop
- `SnorlaxBot/Waiting.swift` — v0.51 waiting ··· until first token; v0.58 Reduce Motion static ···
- `SnorlaxBot/StreamingCaret.swift` — v0.52 streaming caret on LEFT bubble
- `SnorlaxBot/ComposerTextView.swift` — v0.53 UIKeyCommand Escape = Stop; v0.55 Return does not send while generating
- `SnorlaxBot/SendMuted.swift` — v0.55 Send muted while generating
- `SnorlaxBot/CompactToolTraces.swift` — v0.56 compact tool traces (`N tools` + chevron)
- `SnorlaxBot/MidStreamPlaintext.swift` — v0.57 mid-stream LEFT plaintext until complete / Stop
- `SnorlaxBot/katex.min.js` / `katex.min.css` / `fonts/` — bundled KaTeX
- `SnorlaxBot/RuntimeClient.swift` — `/v1` + SSE
- `SnorlaxBot/Generated/V1Types.swift` — OpenAPI models
- `SnorlaxBot/KeychainStore.swift` — bearer token
