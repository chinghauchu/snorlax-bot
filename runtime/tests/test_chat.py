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
    deltas = "".join(
        payload["delta"] for name, payload in events if name == "message.delta"
    )
    assert "mock backend" in deltas
    assert "Draft a Monday briefing." in deltas
    first_delta = next(p for n, p in events if n == "message.delta")
    assert first_delta["id"] == first_delta["id"]
    assert first_delta["role"] == "assistant"
    assert first_delta["senderId"] == "snorlax-bot"
    assert first_delta["senderName"] == "Snorlax-Bot"
    assert first_delta["senderAvatar"] is None
    assert first_delta["delta"]
    done = events[-1][1]
    assert "message" not in done
    assert done["role"] == "assistant"
    assert done["agentId"] == "snorlax-bot"
    assert done["senderId"] == "snorlax-bot"
    assert done["senderName"] == "Snorlax-Bot"
    assert done["hop"] == 0
    assert done["mentions"] == []
    assert done["content"] == deltas
    assert done["images"] == []
    assert "createdAt" in done
    assert done["id"] == first_delta["id"]


def test_transcript_persists_and_images_stay_off_model(client) -> None:
    with client.stream(
        "POST",
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={
            "content": "Look at this screenshot.",
            "images": [{"mime": "image/png", "data": "aGVsbG8="}],
        },
    ) as response:
        body = "".join(response.iter_text())

    events = parse_sse(body)
    deltas = "".join(p["delta"] for n, p in events if n == "message.delta")
    assert "aGVsbG8" not in deltas
    done = events[-1][1]
    assert done["images"] == []

    listed = client.get("/v1/agents/snorlax-bot/messages", headers=AUTH)
    assert listed.status_code == 200
    messages = listed.json()
    assert isinstance(messages, list)
    assert messages[0]["role"] == "user"
    assert messages[0]["agentId"] == "snorlax-bot"
    assert messages[0]["senderId"] == "user"
    assert messages[0]["senderName"] == "User"
    assert messages[0]["hop"] == 0
    image = messages[0]["images"][0]
    assert image["mime"] == "image/png"
    assert image["url"] == f"/v1/images/{image['id']}"
    assert set(image) == {"id", "mime", "url"}
    assert messages[1]["role"] == "assistant"
    assert messages[0]["createdAt"] <= messages[1]["createdAt"]

    fetched = client.get(image["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == b"hello"


def test_messages_oldest_first_and_before_cursor(client) -> None:
    for text in ("one", "two", "three"):
        with client.stream(
            "POST",
            "/v1/agents/snorlax-bot/messages",
            headers=AUTH,
            json={"content": text},
        ) as response:
            "".join(response.iter_text())

    messages = client.get("/v1/agents/snorlax-bot/messages", headers=AUTH).json()
    users = [m for m in messages if m["role"] == "user"]
    assert [m["content"] for m in users] == ["one", "two", "three"]

    oldest_user = users[0]
    page = client.get(
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        params={"before": oldest_user["id"], "limit": 10},
    )
    assert page.json() == []


def test_unknown_agent_chat(client) -> None:
    response = client.post(
        "/v1/agents/nope/messages",
        headers=AUTH,
        json={"content": "hi"},
    )
    assert response.status_code == 404
    assert isinstance(response.json()["error"], str)


def test_empty_content_rejected(client) -> None:
    response = client.post(
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={"content": ""},
    )
    assert response.status_code == 422
    assert isinstance(response.json()["error"], str)
