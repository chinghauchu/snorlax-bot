# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from snorlax_runtime.skills import (
    find_skill,
    invoked_skill,
    parse_skill_markdown,
    skill_ask_from_turn,
    slash_rest,
)
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
STATUS_SKILL = """---
name: status
description: Weekday status check.
---

Summarize status in a few lines.
"""

PATCHED_SKILL = """---
name: Status check
description: Weekday status check.
---

Do a short status.

Keep it brief.
"""

KNOWN_SKILL = """---
name: known-skill
description: Named recipe loaded by /known-skill.
---

KNOWN_SKILL_RECIPE_BODY
"""

OTHER_SKILL = """---
name: other-skill
description: A different recipe that must not be the invoked one.
---

OTHER_SKILL_RECIPE_BODY
"""


def _write_status_skill(tmp_path: Path) -> Path:
    path = tmp_path / "skills" / "status" / "SKILL.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(STATUS_SKILL, encoding="utf-8")
    return path


def _write_known_and_other_skills(tmp_path: Path) -> None:
    for slug, text in (
        ("known-skill", KNOWN_SKILL),
        ("other-skill", OTHER_SKILL),
    ):
        path = tmp_path / "skills" / slug / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")


def test_get_skill_body_is_full_skill_md_source(client, tmp_path: Path) -> None:
    path = _write_status_skill(tmp_path)
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    assert rows == [{"id": "status", "name": "status"}]
    assert all(set(row) == {"id", "name"} for row in rows)
    assert all("body" not in row for row in rows)

    got = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert got.status_code == 200
    body = got.json()
    assert set(body) == {"id", "name", "body"}
    assert body["id"] == "status"
    assert body["name"] == "status"
    assert body["body"] == path.read_text(encoding="utf-8")
    assert body["body"].lstrip().startswith("---")
    assert "name: status" in body["body"]
    assert "description: Weekday status check." in body["body"]
    assert "Summarize status in a few lines." in body["body"]
    assert "<p>" not in body["body"]
    assert "<h1>" not in body["body"]


def test_patch_skill_persists_full_source_and_keeps_id(client, tmp_path: Path) -> None:
    path = _write_status_skill(tmp_path)
    patched = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "Status check", "body": PATCHED_SKILL},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["id"] == "status"
    assert body["name"] == "Status check"
    assert body["body"].lstrip().startswith("---")
    assert "name: Status check" in body["body"]
    assert "Do a short status." in body["body"]
    assert "Keep it brief." in body["body"]
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.json() == [{"id": "status", "name": "Status check"}]
    assert all("body" not in row for row in listed.json())
    again = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert again.status_code == 200
    assert again.json()["id"] == "status"
    assert again.json()["name"] == "Status check"
    assert "Do a short status." in again.json()["body"]
    assert again.json()["body"].lstrip().startswith("---")
    text = path.read_text(encoding="utf-8")
    assert "name: Status check" in text
    assert "Do a short status." in text
    assert "Weekday status check." in text
    assert (tmp_path / "skills" / "status" / "SKILL.md").is_file()


def test_patch_recipe_only_body_still_writes_frontmatter(
    client, tmp_path: Path
) -> None:
    _write_status_skill(tmp_path)
    patched = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "status", "body": "Just the recipe now."},
    )
    assert patched.status_code == 200
    assert patched.json()["id"] == "status"
    assert patched.json()["body"].lstrip().startswith("---")
    assert "Just the recipe now." in patched.json()["body"]


def test_delete_skill_is_204_gone_from_list_keeps_routines(
    client, tmp_path: Path
) -> None:
    path = _write_status_skill(tmp_path)
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
    deleted = client.delete(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert deleted.status_code == 204
    assert deleted.content == b""
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []
    missing = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert missing.status_code == 404
    assert not path.exists()
    routines = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert routines.status_code == 200
    rows = routines.json()
    assert any(row["id"] == rid and row["skill"] == "status" for row in rows)


def test_channel_skill_item_routes_are_409(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    got = client.get(f"/v1/agents/{CHANNEL}/skills/status", headers=AUTH)
    assert got.status_code == 409
    patched = client.patch(
        f"/v1/agents/{CHANNEL}/skills/status",
        headers=AUTH,
        json={"name": "Nope", "body": "Nope"},
    )
    assert patched.status_code == 409
    deleted = client.delete(
        f"/v1/agents/{CHANNEL}/skills/status", headers=AUTH
    )
    assert deleted.status_code == 409


def test_unknown_skill_is_404(client) -> None:
    got = client.get(f"/v1/agents/{SEED}/skills/no-such", headers=AUTH)
    assert got.status_code == 404
    patched = client.patch(
        f"/v1/agents/{SEED}/skills/no-such",
        headers=AUTH,
        json={"name": "Nope", "body": "Nope"},
    )
    assert patched.status_code == 404
    deleted = client.delete(f"/v1/agents/{SEED}/skills/no-such", headers=AUTH)
    assert deleted.status_code == 404


def test_missing_agent_skill_item_is_404(client) -> None:
    got = client.get("/v1/agents/no-such/skills/status", headers=AUTH)
    assert got.status_code == 404
    patched = client.patch(
        "/v1/agents/no-such/skills/status",
        headers=AUTH,
        json={"name": "Nope", "body": "Nope"},
    )
    assert patched.status_code == 404
    deleted = client.delete("/v1/agents/no-such/skills/status", headers=AUTH)
    assert deleted.status_code == 404


def test_patch_empty_name_or_body_is_422(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    empty_name = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "  ", "body": "Still a body"},
    )
    assert empty_name.status_code == 422
    empty_body = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "status", "body": "   "},
    )
    assert empty_body.status_code == 422
    missing = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "status"},
    )
    assert missing.status_code == 422
    listed = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert listed.json()["name"] == "status"
    assert listed.json()["body"].lstrip().startswith("---")
    assert "Summarize status" in listed.json()["body"]


def test_post_name_body_writes_skill_md_without_capture(
    client, tmp_path: Path
) -> None:
    """Blank New skill: body present, no capture required. Listed shape."""
    created = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Inbox triage", "body": "Sort the inbox. Keep it brief."},
    )
    assert created.status_code == 201
    assert created.json() == {"id": "inbox-triage", "name": "Inbox triage"}
    assert "body" not in created.json()
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == [{"id": "inbox-triage", "name": "Inbox triage"}]
    assert all(set(row) == {"id", "name"} for row in listed.json())
    path = tmp_path / "skills" / "inbox-triage" / "SKILL.md"
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert text.lstrip().startswith("---")
    assert "name: Inbox triage" in text
    assert "Sort the inbox. Keep it brief." in text
    got = client.get(f"/v1/agents/{SEED}/skills/inbox-triage", headers=AUTH)
    assert got.status_code == 200
    assert got.json()["id"] == "inbox-triage"
    assert got.json()["name"] == "Inbox triage"
    assert "Sort the inbox. Keep it brief." in got.json()["body"]


def test_post_name_body_accepts_full_skill_md_source(
    client, tmp_path: Path
) -> None:
    source = """---
name: Status check
description: Weekday status check.
---

Do a short status.
"""
    created = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Status check", "body": source},
    )
    assert created.status_code == 201
    assert created.json() == {"id": "status-check", "name": "Status check"}
    text = (tmp_path / "skills" / "status-check" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    assert "name: Status check" in text
    assert "description: Weekday status check." in text
    assert "Do a short status." in text


def test_post_name_without_body_is_still_record_path(client) -> None:
    missing = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "From record"},
    )
    assert missing.status_code == 422
    assert missing.json() == {"error": "no pending capture"}
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.json() == []


def test_post_empty_name_or_body_is_422(client, tmp_path: Path) -> None:
    skills_root = tmp_path / "skills"
    for body in (
        {"name": "", "body": "A recipe."},
        {"name": "   ", "body": "A recipe."},
        {"name": "Inbox", "body": ""},
        {"name": "Inbox", "body": "   "},
        {"name": "", "body": ""},
    ):
        response = client.post(
            f"/v1/agents/{SEED}/skills",
            headers=AUTH,
            json=body,
        )
        assert response.status_code == 422
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.json() == []
    after = list(skills_root.rglob("SKILL.md")) if skills_root.exists() else []
    assert after == []


def test_post_name_body_channel_is_409(client) -> None:
    response = client.post(
        f"/v1/agents/{CHANNEL}/skills",
        headers=AUTH,
        json={"name": "Nope", "body": "A recipe."},
    )
    assert response.status_code == 409
    assert response.json() == {"error": "computer session is agent-only"}


def test_post_name_body_missing_agent_is_404(client) -> None:
    response = client.post(
        "/v1/agents/no-such/skills",
        headers=AUTH,
        json={"name": "Nope", "body": "A recipe."},
    )
    assert response.status_code == 404


def test_blank_create_does_not_consume_pending_capture(
    client, tmp_path: Path
) -> None:
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 201
    assert (
        client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH).status_code
        == 201
    )
    assert (
        client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH).status_code
        == 204
    )
    authored = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Authored", "body": "Do the authored thing."},
    )
    assert authored.status_code == 201
    assert authored.json() == {"id": "authored", "name": "Authored"}
    recorded = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "From record"},
    )
    assert recorded.status_code == 201
    assert recorded.json() == {"id": "from-record", "name": "From record"}
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    names = {row["id"] for row in listed.json()}
    assert names == {"authored", "from-record"}
    authored_text = (tmp_path / "skills" / "authored" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    recorded_text = (tmp_path / "skills" / "from-record" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    assert "Do the authored thing." in authored_text
    assert "computer_click" in recorded_text or "Replay" in recorded_text
    assert "Do the authored thing." not in recorded_text


def test_invoked_skill_matches_slash_name_and_slug() -> None:
    skill = parse_skill_markdown(
        STATUS_SKILL, source="skillsDir", path="status/SKILL.md"
    )
    assert skill is not None
    assert find_skill([skill], "status") is skill
    assert find_skill([skill], "STATUS") is skill
    assert invoked_skill([skill], "/status") is skill
    assert invoked_skill([skill], "/status please") is skill
    assert invoked_skill([skill], "please /status") is skill
    assert invoked_skill([skill], "/STATUS") is skill
    named = parse_skill_markdown(
        PATCHED_SKILL, source="skillsDir", path="status-check/SKILL.md"
    )
    assert named is not None
    assert find_skill([named], "Status check") is named
    assert find_skill([named], "status-check") is named
    assert invoked_skill([named], "/Status check") is named
    assert invoked_skill([named], "/status-check extra") is named
    assert invoked_skill([skill], "status") is None
    assert invoked_skill([skill], "/nope") is None
    assert invoked_skill([skill], "/") is None
    assert slash_rest("/status extra") == "status extra"
    assert skill_ask_from_turn(
        [{"role": "user", "content": "/status"}], None
    ) == "/status"


def _capture_generate(client):
    captured: list[list[dict]] = []
    backend = client.app.state.backend
    original = backend.generate

    async def wrapped(messages, tools=None):
        captured.append(list(messages))
        async for part in original(messages, tools=tools):
            yield part

    backend.generate = wrapped
    return captured


def test_one_to_one_known_skill_slash_injects_recipe(client, tmp_path: Path) -> None:
    """1:1 POST /known-skill injects that SKILL.md, not only the catalog dump."""
    _write_known_and_other_skills(tmp_path)
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    names = {row["id"] for row in listed.json()}
    assert "known-skill" in names
    captured = _capture_generate(client)
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "/known-skill"},
    ) as response:
        assert response.status_code == 200
        parse_sse("".join(response.iter_text()))
    stored = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    user = stored[0]
    assert user["role"] == "user"
    assert user["content"] == "/known-skill"
    assert user.get("kind", "message") == "message"
    blob = "\n".join(
        str(m.get("content") or "") for msgs in captured for m in msgs
    )
    assert "### Invoked skill: known-skill" in blob
    assert "KNOWN_SKILL_RECIPE_BODY" in blob
    assert "The user invoked skill known-skill" in blob
    assert "### Invoked skill: other-skill" not in blob


def test_unknown_slash_foo_does_not_inject(client, tmp_path: Path) -> None:
    _write_known_and_other_skills(tmp_path)
    captured = _capture_generate(client)
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "/foo"},
    ) as response:
        assert response.status_code == 200
        parse_sse("".join(response.iter_text()))
    stored = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert stored[0]["content"] == "/foo"
    assert stored[0]["role"] == "user"
    assert stored[0].get("kind", "message") == "message"
    blob = "\n".join(
        str(m.get("content") or "") for msgs in captured for m in msgs
    )
    assert "The user invoked skill" not in blob
    assert "### Invoked skill:" not in blob


def test_channel_known_skill_slash_does_not_load(client, tmp_path: Path) -> None:
    _write_known_and_other_skills(tmp_path)
    listed = client.get(f"/v1/agents/{CHANNEL}/skills", headers=AUTH)
    assert listed.status_code == 409
    captured = _capture_generate(client)
    with client.stream(
        "POST",
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        json={"content": "/known-skill @Snorlax", "mentions": [SEED]},
    ) as response:
        assert response.status_code == 200
        parse_sse("".join(response.iter_text()))
    users = [
        m
        for m in client.get(f"/v1/agents/{CHANNEL}/messages", headers=AUTH).json()
        if m["role"] == "user"
    ]
    assert users[-1]["content"] == "/known-skill @Snorlax"
    blob = "\n".join(
        str(m.get("content") or "") for msgs in captured for m in msgs
    )
    assert "### Invoked skill:" not in blob
    assert "The user invoked skill" not in blob
