# iOS companion

Snorlax-Bot’s phone client. SwiftUI, iOS 18+, same locked `/v1` camelCase
contract as desktop. Chat-only: named agents, streaming transcript, image
previews that are **never** sent to the model.

The Spark stays up when the phone sleeps. Reconnect is
`GET /v1/agents/{id}/messages`.

## v0

| | |
| --- | --- |
| Language | Swift 5.9+, SwiftUI |
| Target | iOS 18+ (iPhone + iPad) |
| Network | URLSession, `Authorization: Bearer` on everything except `GET /v1/health` |
| Chat | `POST /v1/agents/{id}/messages` as SSE (`message.delta` / `message.done` / `error`) |
| Pairing | Settings sheet. Token in Keychain, URL in AppStorage. No gate screen |
| Seed | `snorlax-bot` (Snorlax / Assistant) and `snorlax-bot-group` (Snorlax-Bot, Channel). Extra user-created channels. Swipe-delete on every row including the seed agent and seed channel (not in the info pane). After seed channel delete, select an agent first if any remain, else a remaining channel; never recreate `snorlax-bot-group` |

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
- `SnorlaxBot/RuntimeClient.swift` — `/v1` + SSE
- `SnorlaxBot/Generated/V1Types.swift` — OpenAPI models
- `SnorlaxBot/KeychainStore.swift` — bearer token
