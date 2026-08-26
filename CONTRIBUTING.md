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
- **Keep v0.11 small.** Named teammates, identity pane, seeded group plus extra
  channels, @mentions, 1:1 isolation, channel handoff threads, report-back,
  runtime-owned file/shell/web tools in a `~/.snorlax-bot` sandbox (auto-run,
  no extra shell network, configured search provider), a thin desktop
  Computer pane over that sandbox, a runtime MCP client (`mcp.json`
  stdio + LAN; desktop/iOS never speak MCP), connect chrome
  (`GET /v1/plugins` + `kind=connect`; Settings list only), question widgets
  (`kind=widget`; not tool approval), cron routines (list + enable/pause
  on the agent info pane; SKILL.md from the workspace and/or
  `SNORLAX_DATA_DIR/skills`), and assistant markdown (clients render
  LEFT `kind=message`; `content` stays a plain string). Full sandbox
  computer GUI, vision, marketplace UI, teach-a-task, and event listeners
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
- Default model: 70B-class FP8, config-swappable. Images persist, no VL.

If a change needs to break the OpenAPI contract, update
[protocol/openapi.yaml](protocol/openapi.yaml) (source of truth) in the same
PR and add a runtime test. Do not reintroduce `instructions`, snake_case
`created_at`, `attachments`, or `{ agents: [] }` / `{ messages: [] }` wrappers.

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
