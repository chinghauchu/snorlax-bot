# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from snorlax_runtime.routines import (
    create_confirm_widget,
    delete_confirm_widget,
    when_label,
)
from snorlax_runtime.skills import SEED_ROUTINES_SLUG
from snorlax_runtime.tools import done_summary, offered_tool_definitions
from tests.conftest import AUTH, parse_sse
from tests.test_routines import _FakePlugins, _write_status_skill

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
CRON = "0 9 * * 1-5"


def _send(
    client,
    dest: str,
    content: str = "",
    *,
    mentions: list[str] | None = None,
    widget_reply: dict | None = None,
):
    payload: dict = {"content": content}
    if mentions is not None:
        payload["mentions"] = mentions
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


def _msgs(client, dest: str) -> list[dict]:
    return client.get(f"/v1/agents/{dest}/messages", headers=AUTH).json()


def _tool_dones(events: list[tuple[str, dict]], name: str) -> list[dict]:
    return [p for n, p in events if n == "tool.done" and p.get("name") == name]


def _pending_widget(client, dest: str) -> dict:
    cards = [m for m in _msgs(client, dest) if m.get("kind") == "widget"]
    assert cards
    return cards[-1]


def _listed_routines(client, dest: str = SEED) -> list[dict]:
    return client.get(f"/v1/agents/{dest}/routines", headers=AUTH).json()


def test_routine_tools_are_offered() -> None:
    names = [
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    ]
    assert "create_routine" in names
    assert "pause_routine" in names
    assert "delete_routine" in names


def test_done_summary_scheduled_paused_removed() -> None:
    assert (
        done_summary("create_routine", {"name": "Morning"}, True, "Scheduled Morning")
        == "Scheduled Morning"
    )
    assert (
        done_summary("pause_routine", {"id": "rtn_x", "enabled": False}, True, "Paused X")
        == "Paused X"
    )
    assert (
        done_summary("pause_routine", {"id": "rtn_x", "enabled": True}, True, "Resumed X")
        == "Resumed X"
    )
    assert (
        done_summary("delete_routine", {"id": "rtn_x"}, True, "Removed X")
        == "Removed X"
    )
    assert (
        done_summary("create_routine", {"name": "Morning"}, False, "Error: missing name")
        == "create_routine failed"
    )


def test_confirm_prompts_match_design() -> None:
    cron = create_confirm_widget("Morning status", "Weekdays 9:00")
    assert cron["prompt"] == 'Save "Morning status" for Weekdays 9:00?'
    assert cron.get("helpText") is None
    assert cron["options"][0]["label"] == "Save"
    assert cron["options"][0]["style"] == "primary"
    assert cron["options"][1]["label"] == "Don't"
    hook = create_confirm_widget("Inbox", "as a webhook")
    assert hook["prompt"] == 'Save "Inbox" for as a webhook?'
    slack = create_confirm_widget("Ping", "Slack #eng")
    assert slack["prompt"] == 'Save "Ping" for Slack #eng?'
    github = create_confirm_widget("PR", "GitHub owner/name")
    assert github["prompt"] == 'Save "PR" for GitHub owner/name?'
    fallback = create_confirm_widget("Loose", None)
    assert fallback["prompt"] == 'Save "Loose"?'
    remove = delete_confirm_widget("Morning status")
    assert remove["prompt"] == 'Remove "Morning status"?'
    assert remove.get("helpText") is None
    assert remove["options"][0]["label"] == "Remove"
    assert remove["options"][0]["style"] == "danger"
    assert remove["options"][1]["label"] == "Keep"
    assert when_label(schedule="0 9 * * 1-5", trigger=None, schedule_label="Weekdays 9:00") == (
        "Weekdays 9:00"
    )
    assert when_label(schedule=None, trigger={"type": "webhook"}) == "as a webhook"


def test_create_routine_emits_pending_widget_does_not_persist(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    status, events, raw = _send(
        client, SEED, 'SNORLAX_TOOL create_routine {"name": "Morning status", "skill": "status", "schedule": "0 9 * * 1-5"}'
    )
    assert status == 200
    assert "event: widget" not in raw
    dones = [p for n, p in events if n == "message.done"]
    widget_done = next(p for p in dones if p.get("kind") == "widget")
    assert widget_done["widgetStatus"] == "pending"
    assert widget_done["widget"]["prompt"] == 'Save "Morning status" for Weekdays 9:00?'
    assert widget_done["widget"].get("helpText") is None
    assert "pendingRoutine" not in (widget_done["widget"] or {})
    labels = [o["label"] for o in widget_done["widget"]["options"]]
    assert labels == ["Save", "Don't"]
    assert not any(n == "tool.start" for n, _ in events)
    assert _listed_routines(client) == []
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert not any("Scheduled" in (m.get("content") or "") for m in tools)


def test_save_persists_and_paints_scheduled(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    _send(
        client, SEED, 'SNORLAX_TOOL create_routine {"name": "Morning status", "skill": "status", "schedule": "0 9 * * 1-5"}'
    )
    card = _pending_widget(client, SEED)
    before_users = [m for m in _msgs(client, SEED) if m["senderId"] == "user"]
    status, events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "values": ["Save"]}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    users = [m for m in listed if m["senderId"] == "user"]
    assert len(users) == len(before_users)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["widgetStatus"] == "resolved"
    assert updated["widgetValues"] == ["Save"]
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[-1]["content"] == "Scheduled Morning status"
    assert tools[-1]["senderId"] == SEED
    rows = _listed_routines(client)
    assert len(rows) == 1
    assert rows[0]["name"] == "Morning status"
    assert rows[0]["skill"] == "status"
    assert any(n == "tool.done" and p.get("name") == "create_routine" for n, p in events)


def test_dont_and_dismiss_do_not_persist(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    _send(
        client, SEED, 'SNORLAX_TOOL create_routine {"name": "Morning status", "skill": "status", "schedule": "0 9 * * 1-5"}'
    )
    card = _pending_widget(client, SEED)
    status, events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "values": ["Don't"]}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    updated = next(m for m in listed if m["id"] == card["id"])
    assert updated["widgetStatus"] == "resolved"
    assert updated["widgetValues"] == ["Don't"]
    assert _listed_routines(client) == []
    assert not any(m.get("kind") == "tool" for m in listed)
    dones = [p for n, p in events if n == "message.done"]
    assert [p["id"] for p in dones] == [card["id"]]

    _send(
        client, SEED, 'SNORLAX_TOOL create_routine {"name": "Webhook inbox", "skill": "status", "trigger": {"type": "webhook"}}'
    )
    hook = _pending_widget(client, SEED)
    assert hook["widget"]["prompt"] == 'Save "Webhook inbox" for as a webhook?'
    status, events, _raw = _send(
        client, SEED, widget_reply={"id": hook["id"], "dismissed": True}
    )
    assert status == 200
    listed = _msgs(client, SEED)
    gone = next(m for m in listed if m["id"] == hook["id"])
    assert gone["widgetStatus"] == "dismissed"
    assert _listed_routines(client) == []
    assert not any(
        m.get("kind") == "tool" and "Scheduled" in (m.get("content") or "")
        for m in listed
    )


def test_pause_wraps_patch(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Morning status", "skill": "status", "schedule": CRON},
    )
    assert created.status_code == 201
    rid = created.json()["id"]
    status, events, _raw = _send(
        client, SEED, f'SNORLAX_TOOL pause_routine {{"id": "{rid}", "enabled": false}}'
    )
    assert status == 200
    dones = _tool_dones(events, "pause_routine")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Paused Morning status"
    row = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH).json()[0]
    assert row["enabled"] is False
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "Paused Morning status"

    status, events, _raw = _send(
        client, SEED, f'SNORLAX_TOOL pause_routine {{"id": "{rid}", "enabled": true}}'
    )
    assert status == 200
    assert _tool_dones(events, "pause_routine")[-1]["summary"] == "Resumed Morning status"
    row = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH).json()[0]
    assert row["enabled"] is True


def test_delete_confirms_then_removes(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Morning status", "skill": "status", "schedule": CRON},
    )
    rid = created.json()["id"]
    status, events, _raw = _send(
        client, SEED, f'SNORLAX_TOOL delete_routine {{"id": "{rid}"}}'
    )
    assert status == 200
    assert not any(n == "tool.start" for n, _ in events)
    card = _pending_widget(client, SEED)
    assert card["widget"]["prompt"] == 'Remove "Morning status"?'
    assert card["widget"].get("helpText") is None
    assert [o["label"] for o in card["widget"]["options"]] == ["Remove", "Keep"]
    assert _listed_routines(client)[0]["id"] == rid

    status, events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "values": ["Keep"]}
    )
    assert status == 200
    assert _listed_routines(client)[0]["id"] == rid
    assert not any(
        m.get("kind") == "tool" and "Removed" in (m.get("content") or "")
        for m in _msgs(client, SEED)
    )

    status, events, _raw = _send(
        client, SEED, f'SNORLAX_TOOL delete_routine {{"id": "{rid}"}}'
    )
    assert status == 200
    card = _pending_widget(client, SEED)
    status, events, _raw = _send(
        client, SEED, widget_reply={"id": card["id"], "values": ["Remove"]}
    )
    assert status == 200
    assert _listed_routines(client) == []
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "Removed Morning status"
    http = client.delete(f"/v1/agents/{SEED}/routines/{rid}", headers=AUTH)
    assert http.status_code == 404


def test_channel_create_is_tool_error_409(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    status, events, _raw = _send(
        client,
        CHANNEL,
        '@Snorlax SNORLAX_TOOL create_routine {"name": "Nope", "skill": "status", "schedule": "0 9 * * 1-5"}',
        mentions=[SEED],
    )
    assert status == 200
    dones = _tool_dones(events, "create_routine")
    assert dones
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "create_routine failed"
    channel_msgs = _msgs(client, CHANNEL)
    assert not any(m.get("kind") == "widget" for m in channel_msgs)
    assert _listed_routines(client) == []


def test_slack_github_unconnected_are_tool_errors(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins([])
    status, events, _raw = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_routine {"name": "Slack ping", "skill": "status", "trigger": {"type": "slack", "channel": "#eng"}}',
    )
    assert status == 200
    dones = _tool_dones(events, "create_routine")
    assert dones[0]["ok"] is False
    assert _listed_routines(client) == []
    status, events, _raw = _send(
        client,
        SEED,
        'SNORLAX_TOOL create_routine {"name": "GitHub ping", "skill": "status", "trigger": {"type": "github", "repo": "owner/name"}}',
    )
    assert status == 200
    assert _tool_dones(events, "create_routine")[0]["ok"] is False
    http = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng"},
        },
    )
    assert http.status_code == 422


def test_missing_name_skill_unknown_bad_cron_are_tool_errors(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    for line in (
        'SNORLAX_TOOL create_routine {"name": "", "skill": "status", "schedule": "0 9 * * 1-5"}',
        'SNORLAX_TOOL create_routine {"name": "Ghost", "skill": "", "schedule": "0 9 * * 1-5"}',
        'SNORLAX_TOOL create_routine {"name": "Ghost", "skill": "not-a-skill", "schedule": "0 9 * * 1-5"}',
        'SNORLAX_TOOL create_routine {"name": "Bad", "skill": "status", "schedule": "not-cron"}',
        'SNORLAX_TOOL create_routine {"name": "Both", "skill": "status", "schedule": "0 9 * * 1-5", "trigger": {"type": "webhook"}}',
    ):
        status, events, _raw = _send(client, SEED, line)
        assert status == 200, line
        dones = _tool_dones(events, "create_routine")
        assert dones, line
        assert dones[0]["ok"] is False, line
    assert _listed_routines(client) == []
    assert not any(m.get("kind") == "widget" for m in _msgs(client, SEED))


def test_b_does_not_create_into_a(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    status, events, _raw = _send(
        client,
        bob["id"],
        'SNORLAX_TOOL create_routine {"name": "Bob job", "skill": "status", "schedule": "0 9 * * 1-5"}',
    )
    assert status == 200
    card = _pending_widget(client, bob["id"])
    assert card["senderId"] == bob["id"]
    _send(client, bob["id"], widget_reply={"id": card["id"], "values": ["Save"]})
    a_rows = _listed_routines(client, SEED)
    b_rows = _listed_routines(client, bob["id"])
    assert a_rows == []
    assert len(b_rows) == 1
    assert b_rows[0]["name"] == "Bob job"
    a_msgs = _msgs(client, SEED)
    assert not any(m.get("kind") == "widget" for m in a_msgs)
    assert not any(m["senderId"] == bob["id"] for m in a_msgs)


def test_seed_skill_maps_routine_words(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH).json()
    ids = {row["id"] for row in listed}
    names = {row["name"] for row in listed}
    assert SEED_ROUTINES_SLUG in ids
    assert "routines" in names
    body = client.get(
        f"/v1/agents/{SEED}/skills/{SEED_ROUTINES_SLUG}", headers=AUTH
    ).json()
    text = body["body"]
    assert "create_routine" in text
    assert "pause_routine" in text
    assert "delete_routine" in text
    assert "定时" in text
    assert "提醒" in text
    assert "每天" in text
    assert "cron" in text
    assert "暂停" in text
    assert "删除这个 routine" in text
    assert "POST /v1/agents/{id}/routines" in text
