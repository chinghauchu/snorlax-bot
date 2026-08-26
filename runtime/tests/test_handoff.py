# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest

from snorlax_runtime.handoff import (
    REPORT_MISS,
    format_brief,
    report_pack,
    strip_involve_kicker,
    wake_pack,
)
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
    assert "I can answer" not in bob_reply["content"].lower()
    assert "I can collaborate" not in bob_reply["content"].lower()
    assert root["replyCount"] >= 1

    alice_later = _msgs(client, alice["id"])
    alice_replies = [m for m in alice_later if m["senderId"] == alice["id"]]
    assert len(alice_replies) >= 2
    assert "Can you look at this" in alice_replies[-1]["content"]
    assert {m["senderId"] for m in alice_later} <= {"user", alice["id"]}


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
    assert any(
        m["senderId"] == alice["id"] and REPORT_MISS in m["content"]
        for m in alice_msgs
    )


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


def test_report_pack_shape() -> None:
    pack = report_pack(
        from_agent={"id": "bob", "name": "Bob", "title": "Math"},
        result="from Bob: 2",
        thread_id="msg_thread",
        user_ask="@Bob answer 1+1",
    )
    assert pack == {
        "from": {"id": "bob", "name": "Bob", "title": "Math"},
        "result": "2",
        "threadId": "msg_thread",
        "userAsk": "@Bob answer 1+1",
    }


def test_strip_involve_kicker() -> None:
    assert strip_involve_kicker("from Mary: 2") == "2"
    assert strip_involve_kicker("The answer is 2") == "The answer is 2"


def test_one_plus_one_report_back_answers_user_in_a_one_to_one(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "@Bob answer 1+1")
    assert status == 200

    alice_msgs = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_msgs} <= {"user", alice["id"]}
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)
    assert _msgs(client, bob["id"]) == []

    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user["handoff"]
    thread_id = user["handoff"]["threadId"]
    thread = _thread(client, thread_id)
    bob_reply = next(m for m in thread if m["senderId"] == bob["id"])
    assert bob_reply["content"].strip() == "2"
    assert "i can" not in bob_reply["content"].casefold()

    alice_replies = [m for m in alice_msgs if m["senderId"] == alice["id"]]
    assert len(alice_replies) >= 2
    report = alice_replies[-1]
    assert report["content"].strip() == "2"
    assert report["senderId"] == alice["id"]
    assert report["senderName"] == "Alice"
    assert report["role"] == "assistant"
    assert report["mentions"] == []
    assert "from" not in report
    assert not report["content"].lower().startswith("from ")
    # User does not need to GET the channel for the answer.
    assert any(m["content"].strip() == "2" for m in alice_msgs)


def test_report_back_copies_scripted_b_result(client) -> None:
    """A mock B answer is copied into A's 1:1 report-back."""
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "What is 3+4 @Bob?")
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    assert any(
        m["senderId"] == alice["id"] and m["content"].strip() == "7"
        for m in alice_msgs
    )
    thread = _thread(
        client,
        [m for m in alice_msgs if m["senderId"] == "user"][-1]["handoff"]["threadId"],
    )
    assert any(m["senderId"] == bob["id"] and m["content"].strip() == "7" for m in thread)
    assert _msgs(client, bob["id"]) == []


def test_report_back_hop_drop_still_reports_miss(client, monkeypatch) -> None:
    monkeypatch.setattr("snorlax_runtime.routing.MAX_HOP", 0)
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    status, _ = _send(client, alice["id"], "@Bob answer 1+1")
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user.get("handoff") is None
    alice_replies = [m for m in alice_msgs if m["senderId"] == alice["id"]]
    assert any(REPORT_MISS in m["content"] for m in alice_replies)
    assert not any(m["content"].strip() == "2" for m in alice_replies)
    assert {m["senderId"] for m in alice_msgs} <= {"user", alice["id"]}
    assert _msgs(client, bob["id"]) == []
    assert _msgs(client, CHANNEL) == []


def test_two_chips_report_as_each_lands(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    carol = _create(client, "Carol")
    status, _ = _send(client, alice["id"], "@Bob @Carol answer 1+1")
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_msgs} <= {"user", alice["id"]}
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)
    assert not any(m["senderId"] == carol["id"] for m in alice_msgs)
    assert _msgs(client, bob["id"]) == []
    assert _msgs(client, carol["id"]) == []

    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user["handoff"]["channelId"] == CHANNEL
    thread = _thread(client, user["handoff"]["threadId"])
    bob_reply = next(m for m in thread if m["senderId"] == bob["id"])
    carol_reply = next(m for m in thread if m["senderId"] == carol["id"])
    reports = [
        m
        for m in alice_msgs
        if m["senderId"] == alice["id"] and m["content"].strip() == "2"
    ]
    assert len(reports) == 2
    assert (
        bob_reply["createdAt"]
        < reports[0]["createdAt"]
        < carol_reply["createdAt"]
        < reports[1]["createdAt"]
    )


def test_one_to_one_involve_stays_on_seed_channel(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Ops",
            "kind": "channel",
            "memberIds": [alice["id"], bob["id"]],
        },
    )
    assert created.status_code == 201
    channel_id = created.json()["id"]
    with client.stream(
        "POST",
        f"/v1/agents/{alice['id']}/messages",
        headers=AUTH,
        json={"content": "@Bob answer 1+1", "channelId": channel_id},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    alice_msgs = _msgs(client, alice["id"])
    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user["handoff"]["channelId"] == CHANNEL
    extra_timeline = client.get(
        f"/v1/agents/{channel_id}/messages", headers=AUTH
    ).json()
    assert extra_timeline == []
    thread = _thread(client, user["handoff"]["threadId"])
    assert any(m["senderId"] == bob["id"] for m in thread)


def test_extra_channel_mention_stays_in_that_channel(client) -> None:
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Ops",
            "kind": "channel",
            "memberIds": [alice["id"], bob["id"]],
        },
    )
    assert created.status_code == 201
    channel_id = created.json()["id"]
    status, _ = _send(client, channel_id, "@Bob answer 1+1")
    assert status == 200
    timeline = client.get(
        f"/v1/agents/{channel_id}/messages", headers=AUTH
    ).json()
    assert timeline[0]["senderId"] == "user"
    thread = client.get(
        f"/v1/agents/{channel_id}/messages",
        headers=AUTH,
        params={"threadId": timeline[0]["id"]},
    ).json()
    assert any(m["senderId"] == bob["id"] for m in thread)
    assert _msgs(client, CHANNEL) == []
    assert _msgs(client, bob["id"]) == []


@pytest.mark.asyncio
async def test_wake_and_one_to_one_prompts(tmp_path) -> None:
    from snorlax_runtime.db import Store

    store = Store(tmp_path)
    await store.connect()
    alice = await store.create_agent("Alice", "", "", None)
    pack = wake_pack(
        originating=alice,
        user_ask="@Bob answer 1+1",
        brief="User: hi",
        mentioned_ids=["bob"],
    )
    messages = await store.inference_transcript(
        CHANNEL,
        for_agent_id=alice["id"],
        thread_id=None,
        wake_pack=pack,
    )
    system = messages[0]["content"]
    assert "DO the task" in system
    assert "Do not acknowledge that you can" in system
    assert "Do not ping-pong" in system
    one_to_one = await store.inference_transcript(
        alice["id"], for_agent_id=alice["id"]
    )
    assert "runtime already routes" in one_to_one[0]["content"]
    report = report_pack(
        from_agent={"id": "bob", "name": "Bob", "title": ""},
        result="2",
        thread_id="msg_1",
        user_ask="@Bob answer 1+1",
    )
    follow = await store.inference_transcript(
        alice["id"],
        for_agent_id=alice["id"],
        wake_pack=report,
    )
    assert "report-back" in follow[0]["content"]
    assert '"result": "2"' in follow[1]["content"]
    assert '"userAsk": "@Bob answer 1+1"' in follow[1]["content"]
    await store.close()
