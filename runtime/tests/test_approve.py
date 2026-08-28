# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json

import pytest

from snorlax_runtime.approve import is_readonly_shell, public_approve
from snorlax_runtime.inference import StreamPart, ToolCall
from snorlax_runtime.tools import run_tool_loop
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"

RM = {"command": "rm -rf scratch"}
RM_LINE = f"SNORLAX_TOOL shell {json.dumps(RM)}"
LS_LINE = f'SNORLAX_TOOL shell {json.dumps({"command": "ls"})}'
PWD_LINE = f'SNORLAX_TOOL shell {json.dumps({"command": "pwd"})}'
CAT_LINE = f'SNORLAX_TOOL shell {json.dumps({"command": "cat note.txt"})}'
GIT_STATUS_LINE = f'SNORLAX_TOOL shell {json.dumps({"command": "git status --short"})}'


def _send(
    client,
    dest: str,
    content: str = "",
    *,
    mentions: list[str] | None = None,
    reply_to: str | None = None,
    approve_reply: dict | None = None,
):
    payload: dict = {"content": content}
    if mentions is not None:
        payload["mentions"] = mentions
    if reply_to is not None:
        payload["replyTo"] = reply_to
    if approve_reply is not None:
        payload["approveReply"] = approve_reply
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
    cards = [m for m in _msgs(client, dest, **params) if m.get("kind") == "approve"]
    assert cards
    return cards[-1]


def _assistant_text(listed):
    return [
        m
        for m in listed
        if m["senderId"] != "user" and m.get("kind") == "message"
    ]


def test_readonly_shell_classifier() -> None:
    assert is_readonly_shell("ls")
    assert is_readonly_shell("ls -la src/")
    assert is_readonly_shell("cat README.md")
    assert is_readonly_shell("pwd")
    assert is_readonly_shell("git status")
    assert is_readonly_shell("git status --short")
    assert is_readonly_shell("git log -n 5")
    assert is_readonly_shell("git diff HEAD~1")
    assert is_readonly_shell("git --no-pager log")
    assert not is_readonly_shell("ls | cat")
    assert not is_readonly_shell("ls && rm -rf /")
    assert not is_readonly_shell("pwd; echo hi")
    assert not is_readonly_shell("cat file > out")
    assert not is_readonly_shell("rm -rf scratch")
    assert not is_readonly_shell("mv a b")
    assert not is_readonly_shell("curl https://example.com")
    assert not is_readonly_shell("python script.py")
    assert not is_readonly_shell("chmod +x bin")
    assert not is_readonly_shell("git commit -am x")
    assert not is_readonly_shell("git add .")
    assert not is_readonly_shell("")
    assert not is_readonly_shell("echo hi")


def test_readonly_ls_auto_runs_no_card(client) -> None:
    status, events, raw = _send(client, SEED, LS_LINE)
    assert status == 200
    assert "event: approve" not in raw
    assert not any(p.get("kind") == "approve" for n, p in events if n == "message.done")
    listed = _msgs(client, SEED)
    assert not any(m.get("kind") == "approve" for m in listed)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[-1]["content"].startswith("Ran ")
    assert any(n == "tool.start" for n, _ in events)
    assert any(n == "tool.done" and p.get("ok") for n, p in events)


def test_readonly_pwd_cat_git_status_auto_run(client, tmp_path) -> None:
    note = tmp_path / "workspaces" / "agents" / SEED / "note.txt"
    note.parent.mkdir(parents=True, exist_ok=True)
    note.write_text("hello\n")
    for line in (PWD_LINE, CAT_LINE, GIT_STATUS_LINE):
        status, events, _raw = _send(client, SEED, line)
        assert status == 200, line
        assert not any(
            p.get("kind") == "approve" for n, p in events if n == "message.done"
        )
        assert any(n == "tool.done" for n, _ in events), line


def test_mutating_emits_pending_kind_approve_does_not_run(client, tmp_path) -> None:
    scratch = tmp_path / "workspaces" / "agents" / SEED / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    (scratch / "keep.txt").write_text("keep")
    status, events, raw = _send(client, SEED, RM_LINE)
    assert status == 200
    assert "event: approve" not in raw
    assert "approve.start" not in raw
    dones = [p for n, p in events if n == "message.done"]
    card_done = next(p for p in dones if p.get("kind") == "approve")
    assert card_done["senderId"] == SEED
    assert card_done["role"] == "assistant"
    assert card_done["approve"] == {"command": RM["command"]}
    assert "status" not in (card_done["approve"] or {})
    assert card_done["approveStatus"] == "pending"
    assert dones[-1]["id"] == card_done["id"]
    assert not any(n == "tool.start" for n, _ in events)
    listed = _msgs(client, SEED)
    cards = [m for m in listed if m.get("kind") == "approve"]
    assert len(cards) == 1
    assert cards[0]["approveStatus"] == "pending"
    assert (scratch / "keep.txt").is_file()


def test_approve_runs_command_then_kind_tool_line(client, tmp_path) -> None:
    scratch = tmp_path / "workspaces" / "agents" / SEED / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    (scratch / "gone.txt").write_text("x")
    _send(client, SEED, RM_LINE)
    card = _pending_card(client, SEED)
    before_users = [m for m in _msgs(client, SEED) if m["senderId"] == "user"]
    status, events, _raw = _send(
        client, SEED, approve_reply={"id": card["id"], "approved": True}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len(before_users)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["kind"] == "approve"
    assert updated["approveStatus"] == "approved"
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[-1]["content"].startswith("Ran ")
    assert tools[-1]["senderId"] == SEED
    assert not (scratch / "gone.txt").exists()
    dones = [p for n, p in events if n == "message.done"]
    assert dones[0]["id"] == card["id"]
    assert dones[0]["approveStatus"] == "approved"
    assert any(p.get("kind") == "tool" for p in dones)
    assert any(n == "tool.done" and p.get("name") == "shell" for n, p in events)
    assert _assistant_text(listed)


def test_deny_does_not_run_and_does_not_wake(client, tmp_path) -> None:
    scratch = tmp_path / "workspaces" / "agents" / SEED / "scratch"
    scratch.mkdir(parents=True, exist_ok=True)
    (scratch / "keep.txt").write_text("keep")
    _send(client, SEED, RM_LINE)
    card = _pending_card(client, SEED)
    before = _msgs(client, SEED)
    before_text = _assistant_text(before)
    status, events, _raw = _send(
        client, SEED, approve_reply={"id": card["id"], "dismissed": True}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["approveStatus"] == "denied"
    assert (scratch / "keep.txt").is_file()
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len([m for m in before if m["senderId"] == "user"])
    assert _assistant_text(listed) == before_text
    assert not any(m.get("kind") == "tool" for m in listed)
    dones = [p for n, p in events if n == "message.done"]
    assert [p["id"] for p in dones] == [card["id"]]
    assert not any(n == "tool.start" for n, _ in events)


def test_content_while_pending_is_409(client) -> None:
    _send(client, SEED, RM_LINE)
    card = _pending_card(client, SEED)
    before = _msgs(client, SEED)
    status, _events, raw = _send(client, SEED, "never mind, ship it")
    assert status == 409
    assert "approve pending" in raw
    after = _msgs(client, SEED)
    assert len(after) == len(before)
    updated = next(m for m in after if m["id"] == card["id"])
    assert updated["approveStatus"] == "pending"


def test_second_approve_while_pending_is_409(client) -> None:
    _send(client, SEED, RM_LINE)
    status, _events, raw = _send(client, SEED, RM_LINE)
    assert status == 409
    assert "approve pending" in raw
    cards = [m for m in _msgs(client, SEED) if m.get("kind") == "approve"]
    assert len(cards) == 1
    assert cards[0]["approveStatus"] == "pending"


def test_channel_approve_is_thread_only_never_timeline(client) -> None:
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    status, events, _raw = _send(
        client,
        CHANNEL,
        f"@Bob {RM_LINE}",
        mentions=[bob["id"]],
    )
    assert status == 200
    timeline = _msgs(client, CHANNEL)
    assert not any(m.get("kind") == "approve" for m in timeline)
    root = timeline[-1]
    thread = _msgs(client, CHANNEL, threadId=root["id"])
    bob_cards = [
        m
        for m in thread
        if m.get("kind") == "approve" and m["senderId"] == bob["id"]
    ]
    assert bob_cards
    assert bob_cards[0]["approveStatus"] == "pending"
    assert bob_cards[0].get("replyTo")
    seed_one_to_one = _msgs(client, SEED)
    assert not any(
        m.get("kind") == "approve" and m["senderId"] == bob["id"]
        for m in seed_one_to_one
    )
    del events


def test_b_approve_never_appears_in_a_one_to_one(client) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    _send(client, bob["id"], RM_LINE)
    bob_msgs = _msgs(client, bob["id"])
    bob_cards = [m for m in bob_msgs if m.get("kind") == "approve"]
    assert bob_cards
    assert bob_cards[0]["senderId"] == bob["id"]
    alice_msgs = _msgs(client, alice["id"])
    assert not any(m.get("kind") == "approve" for m in alice_msgs)
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)

    _send(
        client,
        alice["id"],
        f"@Bob please add 2+2 then {RM_LINE}",
        mentions=[bob["id"]],
    )
    alice_later = _msgs(client, alice["id"])
    assert {m["senderId"] for m in alice_later} <= {"user", alice["id"]}
    assert not any(m["senderId"] == bob["id"] for m in alice_later)
    alice_approves = [m for m in alice_later if m.get("kind") == "approve"]
    assert all(row["senderId"] == alice["id"] for row in alice_approves)


def test_report_back_never_copies_peer_approve(client) -> None:
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
    assert not any(
        m.get("kind") == "approve" and m["senderId"] == bob["id"] for m in alice_msgs
    )
    assert all(
        m.get("kind") != "approve" or m["senderId"] == alice["id"] for m in alice_msgs
    )


def test_unknown_id_and_already_closed_are_422(client) -> None:
    _send(client, SEED, RM_LINE)
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(
        client, SEED, approve_reply={"id": "msg_missing", "approved": True}
    )
    assert status == 422
    _send(client, SEED, approve_reply={"id": card["id"], "dismissed": True})
    status, _events, _raw = _send(
        client, SEED, approve_reply={"id": card["id"], "approved": True}
    )
    assert status == 422


def test_empty_content_without_answer_still_422(client) -> None:
    response = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": ""},
    )
    assert response.status_code == 422
    _send(client, SEED, RM_LINE)
    card = _pending_card(client, SEED)
    status, _events, _raw = _send(
        client, SEED, approve_reply={"id": card["id"], "dismissed": True}
    )
    assert status == 200


def test_public_approve_strips_status() -> None:
    parsed = public_approve(
        {"command": "rm foo", "status": "pending", "timeout": 12, "output": "x"}
    )
    assert parsed is not None
    assert parsed["command"] == "rm foo"
    assert parsed["status"] == "pending"


@pytest.mark.asyncio
async def test_run_tool_loop_mutating_shell_stops_after_other_tools(tmp_path) -> None:
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
                        id="call_rm",
                        name="shell",
                        arguments=json.dumps({"command": "rm note.txt"}),
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
    events, content, _widget, _connect, approve, _produced = await run_tool_loop(
        Both(),
        [{"role": "user", "content": "write then rm"}],
        workspace=workspace,
        agent={"id": "a", "name": "A", "avatar": None},
        assistant_id="msg_a",
        stream=True,
        persist_tool=persist,
        max_rounds=8,
    )
    assert approve is not None
    assert approve["command"] == "rm note.txt"
    assert saved and saved[0]["kind"] == "tool"
    assert (workspace / "note.txt").read_text() == "hi"
    assert any(n == "tool.start" and p["name"] == "write_file" for n, p in events)
    assert not any(n == "tool.start" and p["name"] == "shell" for n, p in events)
    assert content == ""
    assert not any(n == "message.delta" for n, p in events)
    assert not any(n.startswith("approve") for n, _ in events)
