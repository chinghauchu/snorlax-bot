# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from snorlax_runtime.cron import TAIPEI, parse_schedule, schedule_words
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


def test_routine_on_channel_is_422(client) -> None:
    response = client.post(
        f"/v1/agents/{CHANNEL}/routines",
        headers=AUTH,
        json={"name": "Nope", "skill": "status", "schedule": "0 9 * * 1-5"},
    )
    assert response.status_code == 422
    listed = client.get(f"/v1/agents/{CHANNEL}/routines", headers=AUTH)
    assert listed.status_code == 422
