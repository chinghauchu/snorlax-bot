# Snorlax-Bot `/v1` protocol

This directory is the source of truth for the LAN HTTP contract.

- [openapi.yaml](openapi.yaml) — OpenAPI 3.1 for the locked v0 API.

Clients (Tauri desktop, later iOS) talk **only** to the FastAPI runtime.
They never call vLLM.

## Auth

Every `/v1` request:

```
Authorization: Bearer <token>
```

The runtime prints and persists the token on first boot.

## Locked routes (v0)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/health` | Token-gated liveness + backend name |
| GET, POST | `/v1/agents` | List / create |
| GET, PATCH, DELETE | `/v1/agents/{agent_id}` | Seeded id `snorlax-bot` cannot be deleted |
| GET | `/v1/agents/{agent_id}/messages` | Transcript |
| POST | `/v1/agents/{agent_id}/messages` | SSE: `message.delta`, `message.done`, `error` |

Chat is text-only to the model. Attachments may be stored.

## SSE

`POST /v1/agents/{agent_id}/messages` uses `Content-Type: text/event-stream`.

```
event: message.delta
data: {"message_id":"msg_...","delta":"Hello"}

event: message.done
data: {"message":{...}}

event: error
data: {"error":{"code":"inference_unavailable","message":"..."}}
```
