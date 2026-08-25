# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from tests.conftest import AUTH, parse_sse

CHANNEL = "snorlax-bot-group"


def _send(client, dest: str, content: str, mentions: list[str] | None = None):
    payload: dict = {"content": content}
    if mentions is not None:
        payload["mentions"] = mentions
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=payload,
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, body


def _msgs(client, dest: str) -> list[dict]:
    return client.get(f"/v1/agents/{dest}/messages", headers=AUTH).json()


def _create(client, name: str, forward: str | None = None) -> dict:
    description = f"FORWARD:@{forward}" if forward else ""
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": name, "description": description},
    )
    assert created.status_code == 201
    return created.json()


def test_seed_channel_auto_join(client) -> None:
    roster = client.get("/v1/agents", headers=AUTH).json()
    channel = next(a for a in roster if a["id"] == CHANNEL)
    assert roster[0]["id"] == CHANNEL
    assert channel["kind"] == "channel"
    assert channel["name"] == "Snorlax-Bot"
    assert channel["title"] == "Group"
    assert "snorlax-bot" in channel["memberIds"]

    inbox = _create(client, "Inbox")
    channel = client.get(f"/v1/agents/{CHANNEL}", headers=AUTH).json()
    assert inbox["id"] in channel["memberIds"]
    assert inbox["kind"] == "agent"
    assert inbox["memberIds"] == []

    blocked = client.delete(f"/v1/agents/{CHANNEL}", headers=AUTH)
    assert blocked.status_code == 409
    assert blocked.json() == {"error": "seeded channel cannot be deleted"}


def test_mention_routing_in_group(client) -> None:
    inbox = _create(client, "Inbox")
    status, _ = _send(client, CHANNEL, "Need a hand @Inbox")
    assert status == 200
    channel_msgs = _msgs(client, CHANNEL)
    senders = [m["senderId"] for m in channel_msgs]
    assert senders[0] == "user"
    assert inbox["id"] in senders
    inbox_replies = [m for m in channel_msgs if m["senderId"] == inbox["id"]]
    assert inbox_replies[0]["hop"] == 0
    snorlax_spoke = [m for m in channel_msgs if m["senderId"] == "snorlax-bot"]
    assert snorlax_spoke == []


def test_unknown_mention_on_user_send_errors(client) -> None:
    status, body = _send(client, "snorlax-bot", "Hey @NotARealPerson")
    # 422 is JSON, not SSE
    assert status == 422
    listed = _msgs(client, "snorlax-bot")
    assert listed == []


def test_unknown_mention_via_json(client) -> None:
    response = client.post(
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={"content": "hello", "mentions": ["nope"]},
    )
    assert response.status_code == 422
    assert "Unknown" in response.json()["error"]


def test_everyone_is_group_only(client) -> None:
    response = client.post(
        "/v1/agents/snorlax-bot/messages",
        headers=AUTH,
        json={"content": "hi @everyone"},
    )
    assert response.status_code == 422
    assert "everyone" in response.json()["error"]


def test_ambiguous_prefix_errors(client) -> None:
    _create(client, "Ann")
    _create(client, "Anna")
    response = client.post(
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        json={"content": "hi @An"},
    )
    assert response.status_code == 422
    assert "Ambiguous" in response.json()["error"]


def test_unique_prefix_ok(client) -> None:
    inbox = _create(client, "Inbox")
    status, _ = _send(client, CHANNEL, "ping @Inb")
    assert status == 200
    senders = [m["senderId"] for m in _msgs(client, CHANNEL)]
    assert inbox["id"] in senders


def test_agent_unknown_mention_ignored(client) -> None:
    alice = _create(client, "Alice", forward="NotARealPerson")
    status, _ = _send(client, CHANNEL, "@Alice please take this")
    assert status == 200
    msgs = _msgs(client, CHANNEL)
    assert [m["senderId"] for m in msgs] == ["user", alice["id"]]
    assert any("@NotARealPerson" in m["content"] for m in msgs if m["senderId"] == alice["id"])


def test_dm_both_one_to_ones_group_not_mirrored(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "Can you look at this @Bob?")
    assert status == 200

    alice_msgs = _msgs(client, alice["id"])
    alice_senders = [m["senderId"] for m in alice_msgs]
    assert alice_senders[0] == "user"
    assert alice_msgs[0]["role"] == "user"
    assert alice["id"] in alice_senders
    assert bob["id"] in alice_senders
    bob_in_alice = [m for m in alice_msgs if m["senderId"] == bob["id"]]
    assert bob_in_alice
    assert bob_in_alice[0]["role"] == "assistant"

    bob_msgs = _msgs(client, bob["id"])
    assert bob_msgs[0]["senderId"] == alice["id"]
    assert bob_msgs[0]["role"] == "assistant"
    assert "User mentioned you in Alice:" in bob_msgs[0]["content"]
    assert "Can you look at this @Bob?" in bob_msgs[0]["content"]
    assert any(m["senderId"] == bob["id"] for m in bob_msgs)

    group = _msgs(client, CHANNEL)
    contents = [m["content"] for m in group]
    assert not any("Can you look at this @Bob?" in c for c in contents)
    assert not any("mentioned you in Alice" in c for c in contents)


def test_hop_three_allowed_fourth_dropped(client) -> None:
    _create(client, "Alice", forward="Bob")
    _create(client, "Bob", forward="Carol")
    _create(client, "Carol", forward="Dave")
    _create(client, "Dave", forward="Eve")
    _create(client, "Eve", forward="Zed")
    status, _ = _send(client, CHANNEL, "@Alice start the chain")
    assert status == 200
    msgs = [m for m in _msgs(client, CHANNEL) if m["senderId"] != "user"]
    names = [m["senderName"] for m in msgs]
    assert names == ["Alice", "Bob", "Carol", "Dave"]
    hops = [m["hop"] for m in msgs]
    assert hops == [0, 1, 2, 3]
    assert "Eve" not in names


def test_same_edge_cap(client) -> None:
    _create(client, "Alice", forward="Bob")
    _create(client, "Bob", forward="Alice")
    status, _ = _send(client, CHANNEL, "@Alice ping-pong")
    assert status == 200
    msgs = [m for m in _msgs(client, CHANNEL) if m["senderId"] != "user"]
    names = [m["senderName"] for m in msgs]
    assert names == ["Alice", "Bob", "Alice"]
    assert [m["hop"] for m in msgs] == [0, 1, 2]


def test_chip_mention_ids_route(client) -> None:
    inbox = _create(client, "Inbox")
    status, _ = _send(
        client,
        CHANNEL,
        "Need a hand @Inbox",
        mentions=[inbox["id"]],
    )
    assert status == 200
    assert any(m["senderId"] == inbox["id"] for m in _msgs(client, CHANNEL))
