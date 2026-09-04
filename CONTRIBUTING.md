# Contributing to Snorlax-Bot

Thank you for helping build a local, Apache-2.0 Grok Bot-like assistant for
NVIDIA DGX Spark.

## Ground rules

- **Public OSS, Apache-2.0.** New files should carry the SPDX header
  `SPDX-License-Identifier: Apache-2.0` where that is conventional (source),
  and must be compatible with Apache-2.0.
- **No Grok Bot source.** Recreate from the public product shape. Do not
  vendor, decompile, or paste proprietary client/server code.
- **No cloud LLM required.** Features must run with the mock inference backend
  in CI and on machines without a 70B checkpoint. `omlx` is the Mac-local
  OpenAI-compat path. `vllm` is the Spark path. Neither is a development
  dependency.
- **Keep v0.31 small.** Named teammates, identity pane, seeded group plus extra
  channels, @mentions, 1:1 isolation, channel handoff threads, report-back,
  runtime-owned file/shell/web tools in a `~/.snorlax-bot` sandbox (auto-run,
  no extra shell network, configured search provider), a thin desktop
  Computer pane over that sandbox, a runtime MCP client (`mcp.json`
  stdio + LAN; desktop/iOS never speak MCP), connect chrome
  (`GET /v1/plugins` + `kind=connect`; Settings list only), MCP Add custom
  (`POST /v1/plugins`, `DELETE /v1/plugins/{id}`; DELETE is uninstall plus
  disconnect; no store), curated plugin catalog (`GET /v1/plugins/catalog`;
  Slack/GitHub Add; not a store),
  question widgets (`kind=widget`; not tool approval), cron + webhook +
  Slack/GitHub routines (list + enable/pause + Add/Remove + Copy webhook URL on the agent info pane;
  Slack/GitHub segments only when that plugin is connected; SKILL.md from the workspace and/or `SNORLAX_DATA_DIR/skills`; cron XOR
  trigger; `DELETE .../routines/{id}` 204), skill markdown editor
  (`GET/PATCH/DELETE /skills/{sid}`; identity-pane Edit sheet), blank New
  skill (`POST /skills { name, body }`; identity-pane Add; record-to-skill
  stays `POST /skills { name }` with pending capture), assistant markdown (clients render
  LEFT `kind=message`; `content` stays a plain string; v0.45 fenced mermaid
  diagrams on completed LEFT `kind=message`), a display-only
  Box computer preview (`GET /v1/agents/{id}/computer` JSON; Bearer PNG at
  `/computer/screenshot`; identity pane), desktop Box takeover
  (`POST /computer/session` → 201 `{ sessionId }`; `DELETE .../session` or
  `DELETE .../session/{sessionId}` → 204; `POST .../pointer` and `.../key`
  while the session is up, 200; Open / Done overlay), iOS Box takeover
  (same session protocol; full-screen Open / Done / Keyboard),
  desktop teach-a-task (`POST /computer/record`; `DELETE .../record`;
  `POST /skills { name }` writes SKILL.md; Record / Stop / Save as skill
  on the takeover bar), and iOS Record (same v0.16 record protocol on the
  iOS takeover bar), and 1:1 composer `/` skill autocomplete (existing `@`
  overlay; Send loads SKILL.md; channel `/` is plain text; no new HTTP), and
  v0.25 chat attachments (`POST /v1/agents/{id}/attachments` +
  `attachmentIds`; composer paperclip / drop; user-right image + file
  chips; OpenAPI stays 0.18.0), and v0.26 agent-sent attachments (GET
  on assistant `kind=message`; LEFT chrome matches user-right; runtime
  binds write_file / screenshot), and v0.27 video attachments (`kind=video`;
  50MB; clients play; not fed to the model), and v0.28 `watch_video`
  (`Watched {name}` on the existing kind=tool line; no Watch button; desktop/iOS idle), and v0.29 IME-safe composer Enter plus `create_agent` / `create_channel` (wrap `POST /v1/agents`; `Created {name}`; 项目 / 员工 seed skill), and v0.30 composer clipboard paste (same pending chips as paperclip / drop; text-only paste stays in the field; OpenAPI stays 0.18.0), and v0.31 Copy / Regenerate on assistant LEFT `kind=message` (`{ regenerate: true }`; OpenAPI stays 0.18.0). Full sandbox
  computer GUI (VNC), public marketplace / search, and extra channel types
  are later — see [ROADMAP.md](ROADMAP.md).

## Locked v0 decisions (do not reopen in drive-by PRs)

- Serving: oMLX on Mac-local; vLLM on Spark; TensorRT-LLM is a later swap
  behind the same interface.
- Clients never hit oMLX or vLLM. The FastAPI runtime owns agents, transcripts, LAN
  auth.
- HTTP is `/v1` with `Authorization: Bearer <token>`. Seeded agent id is
  `snorlax-bot`. SQLite on disk. Bind `127.0.0.1` until a token exists, then
  `0.0.0.0`.
- Desktop is TypeScript + Tauri. iOS is Swift/SwiftUI.
- Default model: 70B-class FP8, config-swappable. v0.25 `attachmentIds`
  images go in that turn; v0.26 agent-sent write_file / screenshot files
  bind onto the assistant `kind=message`; v0.27 video ids persist on
  the message but are not sent as bytes; v0.28 `watch_video` describes a
  video as text when the agent calls it; v0.29 `create_agent` /
  `create_channel` wrap existing `POST /v1/agents` (`Created {name}`
  tool line); legacy `images[]` persist
  off-model.

If a change needs to break the OpenAPI contract, update
[protocol/openapi.yaml](protocol/openapi.yaml) (source of truth) in the same
PR and add a runtime test. Do not reintroduce `instructions`, snake_case
`created_at`, or `{ agents: [] }` / `{ messages: [] }` /
`{ attachments: [] }` list-endpoint wrappers. Message.attachments and
`POST /v1/agents/{id}/attachments` are in-contract (v0.25 / v0.26 / v0.27 / v0.28 / v0.29 / v0.31).

## Development

Runtime:

```bash
cd runtime
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest
```

Desktop web UI (no Rust toolchain required):

```bash
cd desktop
npm install
npm run build
```

Please run `pytest` before sending a runtime change.

## PR hygiene

- One concern per PR when possible.
- Match the existing voice: named *teammates*, not “sessions” or “threads”
  as the primary object.
- Do not add analytics, phone-home, or extra cloud inference paths.
- New endpoints live under `/v1` and require the bearer token.

## License of contributions

By contributing, you agree that your contributions are licensed under the
Apache License 2.0, copyright assigned per the license’s contribution terms
(see [LICENSE](LICENSE)).
