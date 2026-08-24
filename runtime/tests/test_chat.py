# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from tests.conftest import AUTH, parse_sse


def test_chat_sse_mock(client) -> None:
    with client.stream(
        "POST",
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={"content": "Draft a Monday briefing."},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]
        body = "".join(response.iter_text())

    events = parse_sse(body)
    names = [name for name, _ in events]
    assert "message.delta" in names
    assert names[-1] == "message.done"
    deltas = "".join(payload["delta"] for name, payload in events if name == "message.delta")
    assert "mock backend" in deltas
    assert "Draft a Monday briefing." in deltas
    done = events[-1][1]["message"]
    assert done["role"] == "assistant"
    assert done["content"] == deltas
    assert done["id"].startswith("msg_")


def test_transcript_persists_and_images_stay_off_model(client) -> None:
    with client.stream(
        "POST",
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={
            "content": "Look at this screenshot.",
            "attachments": [
                {
                    "filename": "board.png",
                    "media_type": "image/png",
                    "data_base64": "aGVsbG8=",
                }
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    events = parse_sse(body)
    deltas = "".join(p["delta"] for n, p in events if n == "message.delta")
    assert "board.png" not in deltas
    assert "aGVsbG8" not in deltas

    listed = client.get("/v1/agents/snorlax-bot/messages", headers=AUTH)
    assert listed.status_code == 200
    messages = listed.json()["messages"]
    assert messages[0]["role"] == "user"
    assert messages[0]["attachments"][0]["filename"] == "board.png"
    assert messages[0]["attachments"][0]["sent_to_model"] is False
    assert messages[1]["role"] == "assistant"


def test_unknown_agent_chat(client) -> None:
    response = client.post(
        "/v1/agents/nope/messages",
        headers=AUTH,
        json={"content": "hi"},
    )
    assert response.status_code == 404


def test_empty_content_rejected(client) -> None:
    response = client.post(
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={"content": ""},
    )
    assert response.status_code == 422
