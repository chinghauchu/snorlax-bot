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
| Seed | `snorlax-bot` (Snorlax-Bot / Assistant). Delete is hidden |

Open `SnorlaxBot.xcodeproj` in Xcode. Product name is **SnorlaxBot**; chrome
says **Snorlax-Bot**.

## Pairing

1. Runtime on the Spark is bound to `0.0.0.0:8787` (token already on disk).
2. iPhone on the same LAN.
3. Settings → paste `http://<spark-lan>:8787` and the bearer token.
4. Launch with both set: `GET /v1/agents`, select `snorlax-bot`, load
   messages, focus the composer.

URL and token start empty. The client never defaults to `127.0.0.1`.
`GET /v1/health` is unauthenticated and does not enable send.

## Sources

Hand-written against the locked camelCase `/v1` contract. Do not generate
types from a snake_case `protocol/openapi.yaml` draft.

- `SnorlaxBot/SnorlaxBotApp.swift` — entry, theme, accent
- `SnorlaxBot/ContentView.swift` — iPhone stack / iPad split chrome
- `SnorlaxBot/AppModel.swift` — roster, chat, settings persistence
- `SnorlaxBot/RuntimeClient.swift` — `/v1` + SSE
- `SnorlaxBot/KeychainStore.swift` — bearer token
