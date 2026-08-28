# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json

import pytest

from snorlax_runtime.inference import StreamPart, ToolCall
from snorlax_runtime.tools import run_tool_loop
from snorlax_runtime.widgets import parse_widget_args
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"

ASK = {
    "prompt": "Which editor should we use?",
    "options": [
        {"label": "VS Code", "value": "Use VS Code"},
        {"label": "Neovim", "value": "Use Neovim", "style": "primary"},
    ],
}
ASK_LINE = f"SNORLAX_TOOL ask_user_question {json.dumps(ASK)}"


def _send(
    client,
    dest: str,
    content: str = "",
    *,
    mentions: list[str] | None = None,
    reply_to: str | None = None,
    widget_reply: dict | None = None,
):
    payload: dict = {"content": content}
    if mentions is not None:
        payload["mentions"] = mentions
    if reply_to is not None:
        payload["replyTo"] = reply_to
    if widget_reply is not None:
        payload["widgetReply"] = widget_reply
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=payload,
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body), body


def _msgs(client, dest: str, **params):
    return client.get(
        f"/v1/agents/{dest}/messages", headers=AUTH, params=params
    ).json()


def _pending_card(client, dest: str, **params):
    cards = [m for m in _msgs(client, dest, **params) if m.get("kind") == "widget"]
    assert cards
    return cards[-1]


def _assistant_text(listed):
    return [
        m
        for m in listed
        if m["senderId"] != "user" and m.get("kind") == "message"
    ]


def test_parse_widget_fills_value_and_caps_options() -> None:
    parsed = parse_widget_args(
        {
            "question": "Ship it?",
            "options": [
                {"label": "Yes"},
                {"label": "No", "value": "Do not ship", "style": "danger"},
                "Maybe later",
            ]
            + [{"label": f"x{i}"} for i in range(8)],
            "allowCustom": True,
            "multiSelect": False,
            "helpText": "Pick one",
            "dismissOnMoveOn": True,
        }
    )
    assert parsed is not None
    assert parsed["prompt"] == "Ship it?"
    assert parsed["options"][0]["value"] == "Yes"
    assert parsed["options"][1]["style"] == "danger"
    assert parsed["options"][2]["label"] == "Maybe later"
    assert len(parsed["options"]) == 6
    assert parsed["allowCustom"] is True
    assert parsed["dismissOnMoveOn"] is True
    assert parse_widget_args({"prompt": "Hi", "options": []}) is None


def test_emit_and_get_kind_widget(client) -> None:
    status, events, raw = _send(client, SEED, ASK_LINE)
    assert status == 200
    assert "event: widget" not in raw
    assert "widget.start" not in raw
    dones = [p for n, p in events if n == "message.done"]
    widget_done = next(p for p in dones if p.get("kind") == "widget")
    assert widget_done["senderId"] == SEED
    assert widget_done["role"] == "assistant"
    assert widget_done["widget"]["prompt"] == ASK["prompt"]
    assert "status" not in (widget_done["widget"] or {})
    assert "values" not in (widget_done["widget"] or {})
    assert widget_done["widgetStatus"] == "pending"
    assert widget_done["widgetValues"] == []
    assert dones[-1]["id"] == widget_done["id"]
    listed = _msgs(client, SEED)
    cards = [m for m in listed if m.get("kind") == "widget"]
    assert len(cards) == 1
    assert cards[0]["id"] == widget_done["id"]
    assert cards[0]["widgetStatus"] == "pending"
    assert cards[0]["widgetValues"] == []
    assert cards[0]["widget"]["options"][0]["value"] == "Use VS Code"


def test_reply_updates_same_row_no_user_bubble(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    before_users = [m for m in _msgs(client, SEED) if m["senderId"] == "user"]
    status, events, _raw = _send(
        client,
        SEED,
        widget_reply={"id": card["id"], "values": ["Use VS Code"]},
    )
    assert status == 200
    listed = _msgs(client, SEED)
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len(before_users)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["kind"] == "widget"
    assert updated["widgetStatus"] == "resolved"
    assert updated["widgetValues"] == ["Use VS Code"]
    dones = [p for n, p in events if n == "message.done"]
    assert dones[0]["id"] == card["id"]
    assert dones[0]["widgetStatus"] == "resolved"
    assert _assistant_text(listed)
    assert not any(n == "tool.start" for n, _ in events)


def test_dismiss_does_not_wake_agent(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    before = _msgs(client, SEED)
    before_text = _assistant_text(before)
    status, events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "dismissed": True}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["widgetStatus"] == "dismissed"
    assert updated["widgetValues"] == []
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len([m for m in before if m["senderId"] == "user"])
    assert _assistant_text(listed) == before_text
    dones = [p for n, p in events if n == "message.done"]
    assert [p["id"] for p in dones] == [card["id"]]


def test_content_while_pending_is_409(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    before = _msgs(client, SEED)
    status, _events, raw = _send(client, SEED, "never mind, ship it")
    assert status == 409
    assert "question pending" in raw
    after = _msgs(client, SEED)
    assert len(after) == len(before)
    updated = next(m for m in after if m["id"] == card["id"])
    assert updated["widgetStatus"] == "pending"


def test_second_pending_content_is_409(client) -> None:
    _send(client, SEED, ASK_LINE)
    status, _events, _raw = _send(client, SEED, ASK_LINE)
    assert status == 409
    cards = [m for m in _msgs(client, SEED) if m.get("kind") == "widget"]
    assert len(cards) == 1
    assert cards[0]["widgetStatus"] == "pending"


def test_dismiss_on_move_on_auto_dismisses_no_widget_wake(client) -> None:
    ask = {**ASK, "dismissOnMoveOn": True}
    _send(client, SEED, f"SNORLAX_TOOL ask_user_question {json.dumps(ask)}")
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(client, SEED, "Actually use Helix")
    assert status == 200
    listed = _msgs(client, SEED)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["widgetStatus"] == "dismissed"
    users = [m for m in listed if m["senderId"] == "user"]
    assert users[-1]["content"] == "Actually use Helix"
    assert _assistant_text(listed)


def test_unknown_id_and_already_closed_are_422(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(
        client, SEED, widget_reply={"id": "msg_missing", "values": ["Use VS Code"]}
    )
    assert status == 422
    _send(client, SEED, widget_reply={"id": card["id"], "dismissed": True})
    status, _events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "values": ["Use VS Code"]}
    )
    assert status == 422


def test_multiple_values_without_multiselect_422(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(
        client,
        SEED,
        widget_reply={"id": card["id"], "values": ["Use VS Code", "Use Neovim"]},
    )
    assert status == 422
    listed = next(m for m in _msgs(client, SEED) if m["id"] == card["id"])
    assert listed["widgetStatus"] == "pending"


def test_b_widget_never_appears_in_a_one_to_one(client) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    _send(client, bob["id"], ASK_LINE)
    bob_msgs = _msgs(client, bob["id"])
    bob_cards = [m for m in bob_msgs if m.get("kind") == "widget"]
    assert bob_cards
    assert bob_cards[0]["senderId"] == bob["id"]
    alice_msgs = _msgs(client, alice["id"])
    assert not any(m.get("kind") == "widget" for m in alice_msgs)
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)

    _send(
        client,
        alice["id"],
        f"@Bob please add 2+2 then {ASK_LINE}",
        mentions=[bob["id"]],
    )
    alice_later = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_later} <= {"user", alice["id"]}
    assert not any(m["senderId"] == bob["id"] for m in alice_later)
    alice_widgets = [m for m in alice_later if m.get("kind") == "widget"]
    assert all(w["senderId"] == alice["id"] for w in alice_widgets)


def test_report_back_is_text_only_never_copies_b_cards(client) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    _send(
        client,
        alice["id"],
        "@Bob please add 2+2",
        mentions=[bob["id"]],
    )
    alice_msgs = _msgs(client, alice["id"])
    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    assert user.get("handoff")
    thread = _msgs(
        client,
        user["handoff"]["channelId"],
        threadId=user["handoff"]["threadId"],
    )
    assert not any(
        m.get("kind") == "widget" and m["senderId"] == bob["id"] for m in alice_msgs
    )
    reports = [
        m
        for m in alice_msgs
        if m["senderId"] == alice["id"] and m.get("kind") == "message"
    ]
    assert reports
    assert all(m.get("kind") != "widget" or m["senderId"] == alice["id"] for m in alice_msgs)
    del thread


def test_channel_widget_is_thread_only_never_timeline(client) -> None:
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    status, events, _raw = _send(
        client,
        CHANNEL,
        f"@Bob {ASK_LINE}",
        mentions=[bob["id"]],
    )
    assert status == 200
    timeline = _msgs(client, CHANNEL)
    assert not any(m.get("kind") == "widget" for m in timeline)
    root = timeline[-1]
    thread = _msgs(client, CHANNEL, threadId=root["id"])
    bob_cards = [
        m
        for m in thread
        if m.get("kind") == "widget" and m["senderId"] == bob["id"]
    ]
    assert bob_cards
    assert bob_cards[0]["widgetStatus"] == "pending"
    assert bob_cards[0].get("replyTo")
    seed_one_to_one = _msgs(client, SEED)
    assert not any(
        m.get("kind") == "widget" and m["senderId"] == bob["id"]
        for m in seed_one_to_one
    )
    del events


def test_multiselect_reply_is_array_of_values(client) -> None:
    ask = {
        "prompt": "Which languages?",
        "options": [
            {"label": "Python", "value": "Python"},
            {"label": "Rust", "value": "Rust"},
        ],
        "multiSelect": True,
    }
    _send(
        client,
        SEED,
        f"SNORLAX_TOOL ask_user_question {json.dumps(ask)}",
    )
    card = _pending_card(client, SEED)
    before_users = [m for m in _msgs(client, SEED) if m["senderId"] == "user"]
    _send(
        client,
        SEED,
        widget_reply={"id": card["id"], "values": ["Python", "Rust"]},
    )
    listed = _msgs(client, SEED)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["widget"]["multiSelect"] is True
    assert updated["widgetStatus"] == "resolved"
    assert updated["widgetValues"] == ["Python", "Rust"]
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len(before_users)


def test_empty_content_without_answer_still_422(client) -> None:
    response = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": ""},
    )
    assert response.status_code == 422
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "dismissed": True}
    )
    assert status == 200


def test_reply_maps_label_to_value(client) -> None:
    _send(client, SEED, ASK_LINE)
    card = _pending_card(client, SEED)
    _send(
        client,
        SEED,
        widget_reply={"id": card["id"], "values": ["VS Code"]},
    )
    updated = next(m for m in _msgs(client, SEED) if m["id"] == card["id"])
    assert updated["widgetValues"] == ["Use VS Code"]


@pytest.mark.asyncio
async def test_run_tool_loop_widget_stops_after_other_tools_auto_run(tmp_path) -> None:
    class Both:
        async def generate(self, messages, tools=None):
            del messages, tools
            yield StreamPart(
                tool_calls=[
                    ToolCall(
                        id="call_write",
                        name="write_file",
                        arguments=json.dumps(
                            {"path": "note.txt", "content": "hi"}
                        ),
                    ),
                    ToolCall(
                        id="call_ask",
                        name="ask_user_question",
                        arguments=json.dumps(ASK),
                    ),
                ]
            )

    saved: list[dict] = []

    async def persist(content: str, message_id: str) -> dict:
        row = {"id": message_id, "kind": "tool", "content": content}
        saved.append(row)
        return row

    workspace = tmp_path / "ws"
    workspace.mkdir()
    events, content, widget, _connect, _approve, _produced = await run_tool_loop(
        Both(),
        [{"role": "user", "content": "ask me"}],
        workspace=workspace,
        agent={"id": "a", "name": "A", "avatar": None},
        assistant_id="msg_w",
        stream=True,
        persist_tool=persist,
        max_rounds=8,
    )
    assert widget is not None
    assert widget["prompt"] == ASK["prompt"]
    assert saved and saved[0]["kind"] == "tool"
    assert (workspace / "note.txt").read_text() == "hi"
    assert any(n == "tool.start" for n, _ in events)
    assert not any(n == "tool.start" and p["name"] == "ask_user_question" for n, p in events)
    assert content == ""
    assert not any(n == "message.delta" for n, _ in events)
