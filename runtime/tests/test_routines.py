# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from snorlax_runtime.cron import TAIPEI, cron_matches, parse_schedule, schedule_words
from snorlax_runtime.scheduler import fire_due_routines
from snorlax_runtime.skills import load_skills, parse_skill_markdown
from tests.conftest import AUTH

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
STATUS_SKILL = """---
name: status
description: Weekday status check.
---

Summarize status in a few lines.
"""

WORKSPACE_SKILL = """---
name: workspace-note
description: How this agent files notes in its workspace.
---

Write notes to notes.md. Do not dump them in chat.
"""


def _fire(client, when: datetime):
    async def _run():
        return await fire_due_routines(
            client.app.state.store,
            client.app.state.backend,
            now=when,
        )

    assert client.portal is not None
    return client.portal.call(_run)


def _weekdays_nine() -> datetime:
    return datetime(2026, 8, 26, 9, 0, tzinfo=TAIPEI)


def _write_status_skill(tmp_path: Path) -> None:
    path = tmp_path / "skills" / "status" / "SKILL.md"
    path.parent.mkdir(parents=True)
    path.write_text(STATUS_SKILL, encoding="utf-8")


def test_named_hour_compiles_to_cron() -> None:
    cron, label = parse_schedule("weekdays at 9am")
    assert cron == "0 9 * * 1-5"
    assert label == "Weekdays 9:00"
    assert schedule_words(cron) == "Weekdays 9:00"


def test_parse_skill_requires_name_and_description() -> None:
    skill = parse_skill_markdown(
        STATUS_SKILL, source="skillsDir", path="status/SKILL.md"
    )
    assert skill is not None
    assert skill.name == "status"
    assert parse_skill_markdown("# no frontmatter", source="x", path="x") is None


def test_skill_load_from_skills_dir_and_workspace(client, tmp_path: Path) -> None:
    store = client.app.state.store
    _write_status_skill(tmp_path)
    workspace = tmp_path / "workspaces" / "agents" / SEED
    workspace.mkdir(parents=True)
    (workspace / "SKILL.md").write_text(WORKSPACE_SKILL, encoding="utf-8")

    loaded = load_skills(store.data_dir, workspace)
    names = {s.name: s.source for s in loaded}
    assert names["status"] == "skillsDir"
    assert names["workspace-note"] == "workspace"

    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    body = listed.json()
    assert {row["name"] for row in body} == {"status", "workspace-note"}


def test_get_routines_list_shape(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    assert created.status_code == 201
    routine = created.json()
    assert routine["name"] == "Morning status"
    assert routine["skill"] == "status"
    assert routine["schedule"] == "0 9 * * 1-5"
    assert routine["enabled"] is True
    assert "id" in routine
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 1
    assert set(rows[0]).issuperset({"id", "name", "skill", "schedule", "enabled"})
    assert rows[0]["skill"] == "status"
    assert "prompt" not in rows[0]


def test_patch_enabled_false_then_cron_does_not_fire(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    routine_id = created.json()["id"]
    paused = client.patch(
        f"/v1/agents/{SEED}/routines/{routine_id}",
        headers=AUTH,
        json={"enabled": False},
    )
    assert paused.status_code == 200
    assert paused.json()["enabled"] is False
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]


def test_fire_writes_left_one_to_one_with_routine_name(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    new = [m for m in after if m["id"] not in {row["id"] for row in before}]
    assistant = [
        m
        for m in new
        if m["role"] == "assistant" and m.get("kind") == "message"
    ]
    assert assistant, after
    row = assistant[-1]
    assert row["senderId"] == SEED
    assert row["agentId"] == SEED
    assert row["kind"] == "message"
    assert row["routineName"] == "Morning status"
    assert all(m["senderId"] != "user" for m in new)


def test_b_routine_never_appears_in_a_one_to_one(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    other = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Inbox"}
    ).json()
    other_id = other["id"]
    workspace = tmp_path / "workspaces" / "agents" / other_id
    workspace.mkdir(parents=True)
    client.post(
        f"/v1/agents/{other_id}/routines",
        headers=AUTH,
        json={
            "name": "Inbox sweep",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    a_before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    a_after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in a_after] == [m["id"] for m in a_before]
    assert all(m["senderId"] in {"user", SEED} for m in a_after)

    b_msgs = client.get(f"/v1/agents/{other_id}/messages", headers=AUTH).json()
    left = [
        m
        for m in b_msgs
        if m["role"] == "assistant" and m.get("kind") == "message"
    ]
    assert left
    assert all(m["senderId"] == other_id for m in left)
    assert all(m.get("routineName") != "Inbox sweep" or m["senderId"] == other_id for m in left)
    assert all(m["senderId"] != SEED for m in b_msgs)


def test_channel_get_and_patch_routines_are_409(client) -> None:
    listed = client.get(f"/v1/agents/{CHANNEL}/routines", headers=AUTH)
    assert listed.status_code == 409
    patched = client.patch(
        f"/v1/agents/{CHANNEL}/routines/rtn_missing",
        headers=AUTH,
        json={"enabled": False},
    )
    assert patched.status_code == 409


def test_channel_post_routine_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    response = client.post(
        f"/v1/agents/{CHANNEL}/routines",
        headers=AUTH,
        json={"name": "Nope", "skill": "status", "schedule": "0 9 * * 1-5"},
    )
    assert response.status_code == 422


def test_post_unknown_skill_and_bad_cron_are_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    unknown = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Ghost",
            "skill": "not-a-skill",
            "schedule": "0 9 * * 1-5",
        },
    )
    assert unknown.status_code == 422
    bad = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Bad cron", "skill": "status", "schedule": "not-cron"},
    )
    assert bad.status_code == 422


def test_missing_agent_routines_are_404(client) -> None:
    listed = client.get("/v1/agents/no-such-agent/routines", headers=AUTH)
    assert listed.status_code == 404
    created = client.post(
        "/v1/agents/no-such-agent/routines",
        headers=AUTH,
        json={"name": "X", "skill": "status", "schedule": "0 9 * * 1-5"},
    )
    assert created.status_code == 404
    patched = client.patch(
        "/v1/agents/no-such-agent/routines/rtn_x",
        headers=AUTH,
        json={"enabled": False},
    )
    assert patched.status_code == 404


def test_patch_unknown_routine_is_404(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    patched = client.patch(
        f"/v1/agents/{SEED}/routines/rtn_missing",
        headers=AUTH,
        json={"enabled": False},
    )
    assert patched.status_code == 404


def test_no_delete_routine_route(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    rid = created.json()["id"]
    deleted = client.delete(f"/v1/agents/{SEED}/routines/{rid}", headers=AUTH)
    assert deleted.status_code == 405


def test_cron_zone_is_taipei_not_utc(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    utc_nine = datetime(2026, 8, 26, 9, 0, tzinfo=timezone.utc)
    assert not cron_matches("0 9 * * 1-5", utc_nine)
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, utc_nine)
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]

    utc_as_taipei_nine = datetime(2026, 8, 26, 1, 0, tzinfo=timezone.utc)
    assert cron_matches("0 9 * * 1-5", utc_as_taipei_nine)
    _fire(client, utc_as_taipei_nine)
    landed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    new = [m for m in landed if m["id"] not in {row["id"] for row in after}]
    assert any(m.get("routineName") == "Morning status" for m in new)


def test_missed_tick_is_skipped(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, datetime(2026, 8, 26, 10, 0, tzinfo=TAIPEI))
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]


HOOK_HEADER = "X-Snorlax-Hook-Key"


def test_post_cron_and_trigger_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    both = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Both",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
            "trigger": {"kind": "webhook"},
        },
    )
    assert both.status_code == 422
    neither = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Neither", "skill": "status"},
    )
    assert neither.status_code == 422
    event_no_trigger = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "No trigger", "skill": "status", "trigger": None},
    )
    assert event_no_trigger.status_code == 422


def test_post_webhook_mints_url_and_key_with_zero_plugins(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    plugins = client.get("/v1/plugins", headers=AUTH)
    assert plugins.status_code == 200
    assert plugins.json() == []
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    assert created.status_code == 201
    routine = created.json()
    assert routine["name"] == "Inbox ping"
    assert routine["skill"] == "status"
    assert routine["enabled"] is True
    assert routine.get("schedule") in {None, ""}
    assert routine["trigger"] == {"kind": "webhook"}
    assert routine["scheduleLabel"] == "Webhook"
    assert routine["webhookUrl"].endswith(f"/v1/hooks/{routine['id']}")
    assert routine["webhookKey"]
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    row = listed.json()[0]
    assert row["webhookUrl"] == routine["webhookUrl"]
    assert row["webhookKey"] == routine["webhookKey"]
    assert row["trigger"]["kind"] == "webhook"


def test_webhook_post_fires_left_one_to_one_with_routine_name(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    routine = created.json()
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(
        f"/v1/hooks/{routine['id']}",
        headers={HOOK_HEADER: routine["webhookKey"]},
    )
    assert fired.status_code == 202
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    new = [m for m in after if m["id"] not in {row["id"] for row in before}]
    assistant = [
        m
        for m in new
        if m["role"] == "assistant" and m.get("kind") == "message"
    ]
    assert assistant, after
    row = assistant[-1]
    assert row["senderId"] == SEED
    assert row["agentId"] == SEED
    assert row["kind"] == "message"
    assert row["routineName"] == "Inbox ping"
    assert all(m["senderId"] != "user" for m in new)


def test_webhook_pause_stops_fire(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    routine = created.json()
    paused = client.patch(
        f"/v1/agents/{SEED}/routines/{routine['id']}",
        headers=AUTH,
        json={"enabled": False},
    )
    assert paused.status_code == 200
    assert paused.json()["enabled"] is False
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(
        f"/v1/hooks/{routine['id']}",
        headers={HOOK_HEADER: routine["webhookKey"]},
    )
    assert fired.status_code == 202
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]


def test_webhook_b_never_appears_in_a_one_to_one(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    other = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Inbox"}
    ).json()
    other_id = other["id"]
    created = client.post(
        f"/v1/agents/{other_id}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    routine = created.json()
    a_before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(
        f"/v1/hooks/{routine['id']}",
        headers={HOOK_HEADER: routine["webhookKey"]},
    )
    assert fired.status_code == 202
    a_after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in a_after] == [m["id"] for m in a_before]
    assert all(m["senderId"] in {"user", SEED} for m in a_after)
    b_msgs = client.get(f"/v1/agents/{other_id}/messages", headers=AUTH).json()
    left = [
        m
        for m in b_msgs
        if m["role"] == "assistant" and m.get("kind") == "message"
    ]
    assert left
    assert all(m["senderId"] == other_id for m in left)
    assert all(m["senderId"] != SEED for m in b_msgs)


def test_webhook_missing_or_bad_key_is_401(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    rid = created.json()["id"]
    missing = client.post(f"/v1/hooks/{rid}")
    assert missing.status_code == 401
    bearer_only = client.post(f"/v1/hooks/{rid}", headers=AUTH)
    assert bearer_only.status_code == 401
    bad = client.post(
        f"/v1/hooks/{rid}",
        headers={HOOK_HEADER: "not-the-key-not-the-key-not-the-key-xx"},
    )
    assert bad.status_code == 401


def test_webhook_unknown_is_404(client) -> None:
    response = client.post(
        "/v1/hooks/rtn_missing",
        headers={HOOK_HEADER: "any-key-any-key-any-key-any-key-xx"},
    )
    assert response.status_code == 404


def test_cron_routine_hook_path_is_404(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    rid = created.json()["id"]
    fired = client.post(
        f"/v1/hooks/{rid}",
        headers={HOOK_HEADER: "any-key-any-key-any-key-any-key-xx"},
    )
    assert fired.status_code == 404


def test_slack_github_trigger_422_without_plugin(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    slack = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"kind": "slack"},
        },
    )
    assert slack.status_code == 422
    github = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"kind": "github"},
        },
    )
    assert github.status_code == 422


def test_plugin_delete_and_auth_unchanged_with_webhook(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    assert created.status_code == 201
    listed = client.get("/v1/plugins", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []
    missing_auth = client.post("/v1/plugins/missing/auth", headers=AUTH)
    assert missing_auth.status_code == 404
    missing = client.delete("/v1/plugins/missing", headers=AUTH)
    assert missing.status_code == 404
    assert client.get("/v1/plugins/missing/disconnect", headers=AUTH).status_code != 200


def test_webhook_cron_ticker_does_not_fire_event_routine(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"kind": "webhook"},
        },
    )
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]

