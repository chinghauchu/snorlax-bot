# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.handoff import format_brief, wake_pack
from tests.conftest import AUTH
from tests.test_routing import CHANNEL, _create, _msgs, _send, _thread


def test_handoff_after_several_turns_wakes_b_with_brief(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    for i in range(3):
        status, _ = _send(client, alice["id"], f"turn {i} please remember the plan")
        assert status == 200

    status, body = _send(client, alice["id"], "Can you look at this @Bob?")
    assert status == 200
    assert "Bob" not in body or '"senderId":"bob"' not in body.replace(" ", "")

    alice_msgs = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_msgs} <= {"user", alice["id"]}
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)
    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user["handoff"]
    assert user["handoff"]["channelId"] == CHANNEL
    thread_id = user["handoff"]["threadId"]

    assert _msgs(client, bob["id"]) == []

    timeline = _msgs(client, CHANNEL)
    assert all(m.get("kind") == "handoff" or m["senderId"] == "user" for m in timeline)
    assert not any(m["senderId"] == bob["id"] for m in timeline)
    root = next(m for m in timeline if m["id"] == thread_id)
    assert root["kind"] == "handoff"
    assert root["senderId"] == alice["id"]
    assert root["userAsk"] == "Can you look at this @Bob?"
    assert "turn 0" in (root["brief"] or "")
    assert "turn 2" in (root["brief"] or "")

    thread = _thread(client, thread_id)
    assert thread[0]["kind"] == "handoff"
    bob_reply = next(m for m in thread if m["senderId"] == bob["id"])
    assert bob_reply["replyTo"] == thread_id
    assert "Can you look at this" in bob_reply["content"]
    assert "turn 0" in bob_reply["content"]
    assert "userAsk" in bob_reply["content"]
    assert "originating" in bob_reply["content"]
    assert alice["id"] in bob_reply["content"]
    assert root["replyCount"] >= 1


def test_second_mention_reuses_thread(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    _send(client, alice["id"], "Can you look at this @Bob?")
    first = [m for m in _msgs(client, alice["id"]) if m["senderId"] == "user"][-1]
    first_thread = first["handoff"]["threadId"]

    _send(client, alice["id"], "Also @Bob can you confirm the deadline is Friday?")
    second = [m for m in _msgs(client, alice["id"]) if m["senderId"] == "user"][-1]
    assert second["handoff"]["threadId"] == first_thread

    timeline = _msgs(client, CHANNEL)
    handoffs = [m for m in timeline if m.get("kind") == "handoff"]
    assert len(handoffs) == 1
    assert handoffs[0]["id"] == first_thread

    thread = _thread(client, first_thread)
    bob_replies = [m for m in thread if m["senderId"] == bob["id"]]
    assert len(bob_replies) == 2
    via_alias = client.get(
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        params={"replyTo": first_thread},
    ).json()
    assert [m["id"] for m in via_alias] == [m["id"] for m in thread]


def test_agent_dm_is_channel_only_no_jump(client) -> None:
    alice = _create(client, "Alice", forward="Bob")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "Please draft the brief")
    assert status == 200

    alice_msgs = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_msgs} <= {"user", alice["id"]}
    users = [m for m in alice_msgs if m["senderId"] == "user"]
    assert all(m.get("handoff") is None for m in users)
    assert _msgs(client, bob["id"]) == []

    timeline = _msgs(client, CHANNEL)
    handoff = next(m for m in timeline if m.get("kind") == "handoff")
    assert handoff["senderId"] == alice["id"]
    assert handoff["userAsk"] != "Please draft the brief"
    assert "@Bob" in (handoff["userAsk"] or "")
    thread = _thread(client, handoff["id"])
    assert any(m["senderId"] == bob["id"] for m in thread)
    assert not any(m["senderId"] == "user" for m in timeline)
    assert not any(m["senderId"] == "user" for m in thread)


def test_peer_cap_drop_has_no_handoff(client, monkeypatch) -> None:
    monkeypatch.setattr("snorlax_runtime.routing.MAX_PEER_SENDS", 0)
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "Can you look at this @Bob?")
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    user = [m for m in alice_msgs if m["senderId"] == "user"][0]
    assert user.get("handoff") is None
    assert _msgs(client, bob["id"]) == []
    assert _msgs(client, CHANNEL) == []


def test_looping_b_does_not_suppress_a_in_one_to_one(client) -> None:
    alice = _create(client, "Alice", forward="Bob")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "Can you look at this @Bob?")
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    assert any(m["senderId"] == alice["id"] for m in alice_msgs)
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)


def test_format_brief_drops_oldest_to_cap() -> None:
    messages = [
        {"senderId": "user", "senderName": "User", "content": f"msg {i} " + ("x" * 400)}
        for i in range(8)
    ]
    brief = format_brief(messages)
    assert len(brief) <= 2000
    assert "msg 0" not in brief
    assert "msg 7" in brief


def test_wake_pack_shape() -> None:
    pack = wake_pack(
        originating={"id": "alice", "name": "Alice", "title": "Ops"},
        user_ask="Need a look",
        brief="User: hi\nAlice: hello",
        mentioned_ids=["bob"],
    )
    assert pack == {
        "originating": {"id": "alice", "name": "Alice", "title": "Ops"},
        "userAsk": "Need a look",
        "brief": "User: hi\nAlice: hello",
        "mentionedIds": ["bob"],
    }
