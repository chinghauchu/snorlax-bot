# Next tickets

Concrete follow-ups after v0. Open GitHub issues track the same work.

## Product

- **P1 — Roster roles without a workflow builder.** Decide the first-run
  set beyond `snorlax-bot` (e.g. chief-of-staff + one specialist) and the
  copy that teaches “message a teammate,” not “configure an agent graph.”
- **P2 — Question widgets.** Specify approve / pick-one / short-text
  interrupts in the transcript, including what happens if the desktop is
  closed and only iOS is reachable.
- **P3 — Skills vs routines.** Skill = how; routine = which bot + when.
  Write the v1 object model and the “teach a task” review step so we do not
  invent a Zapier clone.
- **P4 — Shared computer threat model.** One sandbox for all bots, shared
  logins. Document what is in-bounds (handoffs) and out-of-bounds (per-bot
  secrets that must not leak across the roster).

## Design

- **D1 — Desktop visual system.** Sidebar of named teammates, status
  (idle / streaming / using computer), cream/teal Snorlax mark, empty
  states that still feel like a messenger.
- **D2 — Computer pane.** How the sandbox screen sits next to chat without
  turning the app into a VNC client. Take-over vs watch-only.
- **D3 — Widgets and attachments in-stream.** Inline, not a modal stack.
  Image persist (v0) vs later VL should look different so people do not
  think the model saw the photo.
- **D4 — iOS parity sheet.** What is allowed to lag the desktop (computer
  take-over) vs what must match (roster, transcript, pairing).

## Backend

- **B1 — vLLM on GB10.** Recipe for 70B FP8: image, `--gpu-memory-utilization`,
  `--max-num-seqs`, `--max-model-len`, sm_121 notes. Health-check that the
  runtime fails clearly when vLLM is down.
- **B2 — Tool loop.** Runtime-owned tools, streamed as future SSE events,
  never leaked as a raw OpenAI tools payload to the desktop.
- **B3 — MCP client.** Stdio + LAN HTTP transports. Reject “MCP must be
  public-internet reachable.”
- **B4 — Sandbox computer.** Browser, filesystem, terminal on the Spark,
  one instance shared by agents, per-agent screen.
- **B5 — Scheduler.** Routines that fire with the laptop closed.
- **B6 — Agent-to-agent.** Direct messages + group thread, still one SQLite,
  still one token.

## Frontend

- **F1 — Streaming markdown.** Token-safe renderer; do not re-parse the
  whole buffer into a flash on every delta.
- **F2 — Pairing.** Read `~/.snorlax-bot` token from Tauri fs when local;
  paste/scan when remote LAN.
- **F3 — Create / edit instructions.** In-app, matching `PATCH /v1/agents/{id}`.
- **F4 — Attachment chip.** Persist via the runtime; badge “not sent to model”
  until VL is on.
- **F5 — Computer pane shell.** Empty pane wired to a later websocket, so
  layout does not have to be redone.

## iOS

- **I1 — `/v1` client.** URLSession SSE with bearer token; share types with
  `protocol/openapi.yaml`.
- **I2 — Pairing screen.** Spark URL + token, Keychain, LAN-only assumption.
- **I3 — Roster + chat.** Same seeded `snorlax-bot`, resume transcript.
- **I4 — Background-safe send.** What happens when the user backgrounds
  mid-stream (runtime keeps generating; iOS reconnects to `GET .../messages`).
