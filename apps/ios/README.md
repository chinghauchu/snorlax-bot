# iOS companion (stub)

Snorlax-Bot’s phone client is Swift/SwiftUI. Same `/v1` contract as desktop,
same bearer token, LAN to the DGX Spark. **This pass is a stub**: it compiles
as a mental model and documents pairing. It does not yet stream chat.

The Spark is the always-on machine. Closing the phone must not unload vLLM.
Reconnect is `GET /v1/agents/{id}/messages`.

## v0 status

| | |
| --- | --- |
| Language | Swift 5.9+, SwiftUI |
| Target | iOS 18+ (matches the public Grok Bot companion baseline) |
| Network | URLSession, `Authorization: Bearer` |
| Chat SSE | Not wired — see ticket I1 |
| Pairing | UI only; Keychain comes in I2 |

## How this will run (next)

1. Runtime on the Spark is bound to `0.0.0.0` (token already on disk).
2. iPhone on the same LAN.
3. User enters `http://<spark-lan-ip>:8787` and the token.
4. Roster + transcript use [../protocol/openapi.yaml](../protocol/openapi.yaml).

Until then, develop against the desktop web UI.

## Sources

- `SnorlaxBot/SnorlaxBotApp.swift` — app entry
- `SnorlaxBot/ContentView.swift` — pairing + empty roster
- `SnorlaxBot/RuntimeClient.swift` — `/v1` types and a non-streaming client sketch

Drop these files into a new Xcode iOS App target named **SnorlaxBot**, or wait
for ticket I3 which will add a real `.xcodeproj`.
