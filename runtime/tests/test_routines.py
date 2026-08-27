# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from snorlax_runtime.cron import TAIPEI, cron_matches, parse_schedule, schedule_words
from snorlax_runtime.scheduler import fire_due_routines
from snorlax_runtime.skills import load_skills, parse_skill_markdown
from tests.conftest import AUTH, without_seed_skills

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
    by_id = {row["id"]: row["name"] for row in body}
    assert by_id["status"] == "status"
    assert by_id["workspace-note"] == "workspace-note"
    assert all(set(row) == {"id", "name"} for row in body)


def test_get_skills_empty_is_200(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert without_seed_skills(listed.json()) == []


def test_channel_get_skills_is_409(client) -> None:
    listed = client.get(f"/v1/agents/{CHANNEL}/skills", headers=AUTH)
    assert listed.status_code == 409


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
    assert set(rows[0]).issuperset({"id", "name", "skill", "schedule", "enabled", "kind"})
    assert rows[0]["skill"] == "status"
    assert rows[0]["kind"] == "cron"
    assert rows[0]["schedule"] == "0 9 * * 1-5"
    assert "prompt" not in rows[0]
    assert "webhookUrl" not in rows[0]
    assert "webhookKey" not in rows[0]
    assert "trigger" not in rows[0]
    assert "label" not in rows[0]


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
    assert unknown.json() == {"error": "unknown skill"}
    bad = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Bad cron", "skill": "status", "schedule": "not-cron"},
    )
    assert bad.status_code == 422


def test_post_missing_name_or_skill_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    missing_name = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"skill": "status", "schedule": "0 9 * * 1-5"},
    )
    assert missing_name.status_code == 422
    missing_skill = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "Ghost", "schedule": "0 9 * * 1-5"},
    )
    assert missing_skill.status_code == 422
    blank = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={"name": "", "skill": "status", "schedule": "0 9 * * 1-5"},
    )
    assert blank.status_code == 422


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


def test_delete_routine_is_204_and_gone_from_list(client, tmp_path: Path) -> None:
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
    rid = created.json()["id"]
    deleted = client.delete(f"/v1/agents/{SEED}/routines/{rid}", headers=AUTH)
    assert deleted.status_code == 204
    assert deleted.content == b""
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []
    again = client.delete(f"/v1/agents/{SEED}/routines/{rid}", headers=AUTH)
    assert again.status_code == 404


def test_delete_webhook_routine_is_204_and_hook_is_404(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"type": "webhook"},
        },
    )
    assert created.status_code == 201
    routine = created.json()
    assert routine["kind"] == "webhook"
    path = _hook_path(routine["webhookUrl"])
    deleted = client.delete(
        f"/v1/agents/{SEED}/routines/{routine['id']}", headers=AUTH
    )
    assert deleted.status_code == 204
    fired = client.post(path)
    assert fired.status_code == 404


def test_delete_unknown_routine_is_404(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    missing = client.delete(
        f"/v1/agents/{SEED}/routines/rtn_missing", headers=AUTH
    )
    assert missing.status_code == 404


def test_channel_delete_routine_is_409(client) -> None:
    deleted = client.delete(
        f"/v1/agents/{CHANNEL}/routines/rtn_missing", headers=AUTH
    )
    assert deleted.status_code == 409


def test_missing_agent_delete_routine_is_404(client) -> None:
    deleted = client.delete(
        "/v1/agents/no-such-agent/routines/rtn_x", headers=AUTH
    )
    assert deleted.status_code == 404


def test_post_workspace_skill_is_201(client, tmp_path: Path) -> None:
    workspace = tmp_path / "workspaces" / "agents" / SEED
    workspace.mkdir(parents=True)
    (workspace / "SKILL.md").write_text(WORKSPACE_SKILL, encoding="utf-8")
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Workspace note",
            "skill": "workspace-note",
            "schedule": "0 9 * * 1-5",
        },
    )
    assert created.status_code == 201
    assert created.json()["skill"] == "workspace-note"
    assert created.json()["kind"] == "cron"


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


def _hook_path(webhook_url: str) -> str:
    parsed = urlparse(webhook_url)
    assert parsed.query == ""
    assert parsed.path.startswith("/v1/hooks/")
    token = parsed.path.rsplit("/", 1)[-1]
    assert token
    return parsed.path


class _FakePlugins:
    def __init__(self, rows: list[dict]) -> None:
        self._rows = rows

    def list_public(self) -> list[dict]:
        return self._rows


def test_post_cron_and_trigger_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    both = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Both",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
            "trigger": {"type": "webhook"},
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


def test_post_webhook_mints_url_with_token_in_path(
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
            "trigger": {"type": "webhook"},
        },
    )
    assert created.status_code == 201
    routine = created.json()
    assert routine["name"] == "Inbox ping"
    assert routine["skill"] == "status"
    assert routine["enabled"] is True
    assert routine["kind"] == "webhook"
    assert "schedule" not in routine
    assert "scheduleLabel" not in routine
    assert "trigger" not in routine
    assert "webhookKey" not in routine
    assert "label" not in routine
    path = _hook_path(routine["webhookUrl"])
    token = path.rsplit("/", 1)[-1]
    assert token != routine["id"]
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    row = listed.json()[0]
    assert row["kind"] == "webhook"
    assert row["webhookUrl"] == routine["webhookUrl"]
    assert "webhookUrl" in row
    assert "webhookKey" not in row
    assert "trigger" not in row
    assert "schedule" not in row


def test_webhook_post_204_fires_left_one_to_one_with_routine_name(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"type": "webhook"},
        },
    )
    routine = created.json()
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(_hook_path(routine["webhookUrl"]))
    assert fired.status_code == 204
    assert fired.content == b""
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


def test_webhook_paused_is_404_and_does_not_fire(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"type": "webhook"},
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
    assert paused.json()["kind"] == "webhook"
    assert paused.json()["webhookUrl"] == routine["webhookUrl"]
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(_hook_path(routine["webhookUrl"]))
    assert fired.status_code == 404
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
            "trigger": {"type": "webhook"},
        },
    )
    routine = created.json()
    a_before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = client.post(_hook_path(routine["webhookUrl"]))
    assert fired.status_code == 204
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


def test_webhook_unknown_or_routine_id_is_404(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"type": "webhook"},
        },
    )
    rid = created.json()["id"]
    by_id = client.post(f"/v1/hooks/{rid}")
    assert by_id.status_code == 404
    unknown = client.post("/v1/hooks/not-a-token")
    assert unknown.status_code == 404


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
    assert "webhookUrl" not in created.json()
    fired = client.post(f"/v1/hooks/{rid}")
    assert fired.status_code == 404


def test_slack_github_trigger_422_without_plugin(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    plugins = client.get("/v1/plugins", headers=AUTH)
    assert plugins.status_code == 200
    assert plugins.json() == []
    slack = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng"},
        },
    )
    assert slack.status_code == 422
    github = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name"},
        },
    )
    assert github.status_code == 422
    client.app.state.mcp = _FakePlugins(
        [{"id": "github", "name": "GitHub", "status": "needsAuth"}]
    )
    needs_auth = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name"},
        },
    )
    assert needs_auth.status_code == 422


def test_slack_github_trigger_201_when_plugin_connected(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [{"id": "slack", "name": "Slack", "status": "connected"}]
    )
    slack = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng", "label": "ignored"},
        },
    )
    assert slack.status_code == 201
    row = slack.json()
    assert row["name"] == "Slack ping"
    assert row["skill"] == "status"
    assert row["enabled"] is True
    assert row["kind"] == "slack"
    assert row["label"] == "Slack #eng"
    assert "webhookUrl" not in row
    assert "schedule" not in row
    assert "scheduleLabel" not in row
    assert "trigger" not in row
    listed_slack = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed_slack.status_code == 200
    assert any(item["kind"] == "slack" for item in listed_slack.json())
    client.app.state.mcp = _FakePlugins(
        [
            {"id": "slack", "name": "Slack", "status": "connected"},
            {"id": "github", "name": "GitHub", "status": "connected"},
        ]
    )
    github = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name"},
        },
    )
    assert github.status_code == 201
    grown = github.json()
    assert grown["kind"] == "github"
    assert grown["label"] == "GitHub owner/name"
    assert "webhookUrl" not in grown
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    kinds = {item["kind"] for item in listed.json()}
    assert "slack" in kinds
    assert "github" in kinds


def test_slack_github_empty_or_wildcard_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [
            {"id": "slack", "name": "Slack", "status": "connected"},
            {"id": "github", "name": "GitHub", "status": "connected"},
        ]
    )
    missing_channel = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack"},
        },
    )
    assert missing_channel.status_code == 422
    empty_channel = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "  "},
        },
    )
    assert empty_channel.status_code == 422
    missing_repo = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github"},
        },
    )
    assert missing_repo.status_code == 422
    wildcard = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/*"},
        },
    )
    assert wildcard.status_code == 422
    extra_path = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "GitHub ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name/extra"},
        },
    )
    assert extra_path.status_code == 422


def _inbound(client, event: dict) -> list:
    from snorlax_runtime.listeners import fire_inbound_event

    async def _run():
        return await fire_inbound_event(
            event,
            store=client.app.state.store,
            backend=client.app.state.backend,
            manager=client.app.state.mcp,
        )

    assert client.portal is not None
    return client.portal.call(_run)


def test_slack_inbound_fires_left_one_to_one(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [{"id": "slack", "name": "Slack", "status": "connected"}]
    )
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng"},
        },
    )
    assert created.status_code == 201
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = _inbound(
        client, {"kind": "slack", "type": "message", "channel": "eng"}
    )
    assert fired
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
    assert row["routineName"] == "Slack ping"
    miss = _inbound(
        client, {"kind": "slack", "type": "message", "channel": "#ops"}
    )
    assert miss == []


def test_github_inbound_fires_pr_events_only(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [{"id": "github", "name": "GitHub", "status": "connected"}]
    )
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "PR ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name"},
        },
    )
    assert created.status_code == 201
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert _inbound(
        client,
        {"kind": "github", "repo": "owner/name", "event": "pr-opened"},
    )
    assert _inbound(
        client,
        {"kind": "github", "repo": "owner/name", "event": "pr-pushed"},
    )
    assert _inbound(
        client,
        {"kind": "github", "repo": "owner/name", "event": "pr-merged"},
    )
    skipped = _inbound(
        client,
        {"kind": "github", "repo": "owner/name", "event": "issue-opened"},
    )
    assert skipped == []
    other_repo = _inbound(
        client,
        {"kind": "github", "repo": "other/name", "event": "pr-opened"},
    )
    assert other_repo == []
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    new = [
        m
        for m in after
        if m["id"] not in {row["id"] for row in before}
        and m["role"] == "assistant"
        and m.get("kind") == "message"
    ]
    assert len(new) == 3
    assert all(m["senderId"] == SEED for m in new)
    assert all(m.get("routineName") == "PR ping" for m in new)


def test_slack_paused_does_not_fire(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [{"id": "slack", "name": "Slack", "status": "connected"}]
    )
    created = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng"},
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
    assert paused.json()["kind"] == "slack"
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    fired = _inbound(
        client, {"kind": "slack", "type": "message", "channel": "#eng"}
    )
    assert fired == []
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]


def test_slack_github_cron_ticker_does_not_fire_listener(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    client.app.state.mcp = _FakePlugins(
        [
            {"id": "slack", "name": "Slack", "status": "connected"},
            {"id": "github", "name": "GitHub", "status": "connected"},
        ]
    )
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Slack ping",
            "skill": "status",
            "trigger": {"type": "slack", "channel": "#eng"},
        },
    )
    client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "PR ping",
            "skill": "status",
            "trigger": {"type": "github", "repo": "owner/name"},
        },
    )
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]


def test_get_omits_slack_github_when_plugin_not_connected(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)

    async def seed() -> None:
        store = client.app.state.store
        await store.create_routine(
            agent_id=SEED,
            name="Slack ping",
            skill="status",
            cron="",
            schedule_label="Slack #eng",
            trigger_type="slack",
        )
        await store.create_routine(
            agent_id=SEED,
            name="GitHub ping",
            skill="status",
            cron="",
            schedule_label="GitHub owner/repo",
            trigger_type="github",
        )

    assert client.portal is not None
    client.portal.call(seed)
    webhook = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Inbox ping",
            "skill": "status",
            "trigger": {"type": "webhook"},
        },
    )
    assert webhook.status_code == 201
    cron = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Morning status",
            "skill": "status",
            "schedule": "0 9 * * 1-5",
        },
    )
    assert cron.status_code == 201
    client.app.state.mcp = _FakePlugins([])
    listed = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    kinds = {row["kind"] for row in rows}
    assert "slack" not in kinds
    assert "github" not in kinds
    assert "webhook" in kinds
    assert "cron" in kinds
    assert all("webhookUrl" not in row or row["kind"] == "webhook" for row in rows)
    client.app.state.mcp = _FakePlugins(
        [
            {"id": "slack", "name": "Slack", "status": "connected"},
            {"id": "github", "name": "GitHub", "status": "connected"},
        ]
    )
    connected = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert connected.status_code == 200
    connected_kinds = {row["kind"] for row in connected.json()}
    assert "slack" in connected_kinds
    assert "github" in connected_kinds


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
            "trigger": {"type": "webhook"},
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
            "trigger": {"type": "webhook"},
        },
    )
    before = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    _fire(client, _weekdays_nine())
    after = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert [m["id"] for m in after] == [m["id"] for m in before]

