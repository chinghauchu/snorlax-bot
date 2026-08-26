# iOS companion

Snorlax-Bot’s phone client. SwiftUI, iOS 18+, same locked `/v1` camelCase
contract as desktop. Named agents, streaming transcript, muted tool traces,
image previews that are **never** sent to the model. Question widgets
render as LEFT cards in the speaking agent's streak (no extra sheet). Agent
info sheet lists routines under the 72px identity (list + enable/pause
+ Copy webhook URL, no extra sheet). Settings lists runtime plugins (Add / Remove; OS browser via
`ASWebAuthenticationSession`). No
computer pane / file browser this slice (v0.6 desktop-only). MCP is
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
| Computer | No file browser / computer pane this slice (desktop-only v0.6) |
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
```

Output: `SnorlaxBot/Generated/V1Types.swift`. Do not hand-edit that file.

## Sources

- `SnorlaxBot/SnorlaxBotApp.swift` — entry, theme, accent
- `SnorlaxBot/ContentView.swift` — iPhone stack / iPad split chrome
- `SnorlaxBot/AppModel.swift` — roster, chat, settings persistence
- `SnorlaxBot/ProfileSheet.swift` — identity / channel pane; agent routines list
- `SnorlaxBot/SettingsSheet.swift` — URL, token, plugins list + Add sheet
- `SnorlaxBot/ConnectCard.swift` — `kind=connect` LEFT card
- `SnorlaxBot/AssistantMarkdown.swift` — assistant LEFT markdown
- `SnorlaxBot/RuntimeClient.swift` — `/v1` + SSE
- `SnorlaxBot/Generated/V1Types.swift` — OpenAPI models
- `SnorlaxBot/KeychainStore.swift` — bearer token
