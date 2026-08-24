# Next tickets

Concrete follow-ups after v0. Filed on GitHub against
[chinghauchu/snorlax-bot](https://github.com/chinghauchu/snorlax-bot).

## Product

- [P1 — First-run roster roles without a workflow builder](https://github.com/chinghauchu/snorlax-bot/issues/2)
- [P2 — Question widgets: approve, pick, short answer](https://github.com/chinghauchu/snorlax-bot/issues/3)
- [P3 — Skills vs routines object model](https://github.com/chinghauchu/snorlax-bot/issues/4)
- [P4 — Shared sandbox computer threat model](https://github.com/chinghauchu/snorlax-bot/issues/5)

## Design

- [D1 — Desktop visual system: roster, status, empty states](https://github.com/chinghauchu/snorlax-bot/issues/11)
- [D2 — Computer pane next to chat](https://github.com/chinghauchu/snorlax-bot/issues/12)
- [D3 — In-stream widgets and attachment chips](https://github.com/chinghauchu/snorlax-bot/issues/8)

## Backend

- [B1 — vLLM on GB10 70B FP8 recipe](https://github.com/chinghauchu/snorlax-bot/issues/10)
- [B2 — Runtime-owned tool loop](https://github.com/chinghauchu/snorlax-bot/issues/14)
- [B3 — MCP client: stdio and LAN, not public internet](https://github.com/chinghauchu/snorlax-bot/issues/15)
- [B4 — Local sandbox computer on the Spark](https://github.com/chinghauchu/snorlax-bot/issues/7)
- [B5 — Scheduler for routines while the laptop is closed](https://github.com/chinghauchu/snorlax-bot/issues/17)
- [B6 — Agent-to-agent messages and group threads](https://github.com/chinghauchu/snorlax-bot/issues/18)

## Frontend

- [F1 — Streaming markdown without flicker](https://github.com/chinghauchu/snorlax-bot/issues/6)
- [F2 — Pairing: local token file and LAN paste](https://github.com/chinghauchu/snorlax-bot/issues/16)
- [F3 — Edit agent name and instructions in the desktop UI](https://github.com/chinghauchu/snorlax-bot/issues/19)
- Attachment chips with “not sent to model” already exist in v0; VL-on
  treatment stays with D3.
- Computer pane shell stays with D2 until B4 lands.

## iOS

- [I1 — `/v1` URLSession SSE client](https://github.com/chinghauchu/snorlax-bot/issues/13)
- [I2/I3 — Pairing, roster, and chat on the LAN](https://github.com/chinghauchu/snorlax-bot/issues/9)
- Background-safe send is part of I1: runtime keeps generating; iOS
  reconnects to `GET /v1/agents/{id}/messages`.
