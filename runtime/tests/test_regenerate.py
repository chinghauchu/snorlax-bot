# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"


def _send(client, dest: str, payload: dict):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=payload,
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body)


def test_regenerate_truncates_last_assistant_turn_and_replays(client) -> None:
    status, events = _send(client, SEED, {"content": "Draft a Monday briefing."})
    assert status == 200
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    users = [m for m in before if m["senderId"] == "user"]
    assistants = [
        m
        for m in before
        if m["senderId"] == SEED and m.get("kind", "message") == "message"
    ]
    assert len(users) == 1
    assert len(assistants) == 1
    old_id = assistants[0]["id"]
    old_text = assistants[0]["content"]
    assert old_text

    status, events = _send(client, SEED, {"regenerate": True})
    assert status == 200
    names = [n for n, _ in events]
    assert "message.delta" in names
    assert names[-1] == "message.done"
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    users_after = [m for m in after if m["senderId"] == "user"]
    assistants_after = [
        m
        for m in after
        if m["senderId"] == SEED and m.get("kind", "message") == "message"
    ]
    assert len(users_after) == 1
    assert users_after[0]["id"] == users[0]["id"]
    assert users_after[0]["content"] == "Draft a Monday briefing."
    assert old_id not in {m["id"] for m in after}
    assert len(assistants_after) == 1
    assert assistants_after[0]["id"] != old_id
    assert assistants_after[0]["content"]
    assert all(m["id"] != old_id for m in after)


def test_regenerate_drops_tool_lines_of_that_turn(client) -> None:
    status, _events = _send(
        client,
        SEED,
        {"content": 'Write a file named app.py containing print("ok")'},
    )
    assert status == 200
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    tools = [m for m in before if m.get("kind") == "tool"]
    assistants = [
        m
        for m in before
        if m["senderId"] == SEED and m.get("kind", "message") == "message"
    ]
    assert tools
    assert assistants
    old_tool_ids = {m["id"] for m in tools}
    old_asst_ids = {m["id"] for m in assistants}

    status, events = _send(client, SEED, {"regenerate": True})
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.start" in names or "message.delta" in names
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert old_tool_ids.isdisjoint({m["id"] for m in after})
    assert old_asst_ids.isdisjoint({m["id"] for m in after})
    users = [m for m in after if m["senderId"] == "user"]
    assert len(users) == 1


def test_regenerate_without_completed_turn_is_422(client) -> None:
    response = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"regenerate": True},
    )
    assert response.status_code == 422
    assert response.json()["error"] == "no completed turn to regenerate"


def test_regenerate_combined_with_content_or_replies_is_422(client) -> None:
    _send(client, SEED, {"content": "hello"})
    for payload in (
        {"regenerate": True, "content": "nope"},
        {"regenerate": True, "attachmentIds": ["att_x"]},
        {
            "regenerate": True,
            "widgetReply": {"id": "msg_x", "dismissed": True},
        },
        {
            "regenerate": True,
            "connectReply": {"id": "msg_y"},
        },
        {
            "regenerate": True,
            "approveReply": {"id": "msg_z", "approved": True},
        },
    ):
        response = client.post(
            f"/v1/agents/{SEED}/messages",
            headers=AUTH,
            json=payload,
        )
        assert response.status_code == 422, payload
        assert "error" in response.json()


def test_regenerate_on_channel_is_409(client) -> None:
    _send(client, CHANNEL, {"content": "hello channel"})
    response = client.post(
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        json={"regenerate": True},
    )
    assert response.status_code == 409
    assert response.json()["error"] == "regenerate is 1:1 only"


def test_regenerate_while_stream_open_is_409(client) -> None:
    _send(client, SEED, {"content": "first"})
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    asst_ids = {
        m["id"]
        for m in before
        if m["senderId"] == SEED and m.get("kind", "message") == "message"
    }
    assert asst_ids
    # Starlette TestClient finishes generators before a nested POST, so seed
    # the same per-conversation lock POST holds while an SSE stream is open.
    streams = client.app.state.open_streams
    streams.add(SEED)
    try:
        blocked = client.post(
            f"/v1/agents/{SEED}/messages",
            headers=AUTH,
            json={"regenerate": True},
        )
        assert blocked.status_code == 409
        assert blocked.json()["error"] == "stream is already open"
    finally:
        streams.discard(SEED)
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert asst_ids <= {m["id"] for m in after}
