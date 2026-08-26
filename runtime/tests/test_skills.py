# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from tests.conftest import AUTH

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
STATUS_SKILL = """---
name: status
description: Weekday status check.
---

Summarize status in a few lines.
"""


def _write_status_skill(tmp_path: Path) -> Path:
    path = tmp_path / "skills" / "status" / "SKILL.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(STATUS_SKILL, encoding="utf-8")
    return path


def test_get_skill_body_is_skill_md_source(client, tmp_path: Path) -> None:
    _write_status_skill(tmp_path)
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    rows = listed.json()
    assert rows == [{"id": "status", "name": "status"}]
    assert all(set(row) == {"id", "name"} for row in rows)

    got = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert got.status_code == 200
    body = got.json()
    assert set(body) == {"id", "name", "body"}
    assert body["id"] == "status"
    assert body["name"] == "status"
    assert "Summarize status in a few lines." in body["body"]
    assert "<p>" not in body["body"]
    assert "<h1>" not in body["body"]


def test_patch_skill_name_and_body(client, tmp_path: Path) -> None:
    path = _write_status_skill(tmp_path)
    patched = client.patch(
        f"/v1/agents/{SEED}/skills/status",
        headers=AUTH,
        json={"name": "Status check", "body": "Do a short status.\n\nKeep it brief."},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["id"] == "status"
    assert body["name"] == "Status check"
    assert body["body"] == "Do a short status.\n\nKeep it brief."
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.json() == [{"id": "status", "name": "Status check"}]
    text = path.read_text(encoding="utf-8")
    assert "name: Status check" in text
    assert "Do a short status." in text
    assert "Weekday status check." in text


def test_delete_skill_is_204_and_gone(client, tmp_path: Path) -> None:
    path = _write_status_skill(tmp_path)
    deleted = client.delete(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert deleted.status_code == 204
    assert deleted.content == b""
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []
    missing = client.get(f"/v1/agents/{SEED}/skills/status", headers=AUTH)
    assert missing.status_code == 404
    assert not path.exists()
    assert not path.parent.exists()


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
    assert "Summarize status" in listed.json()["body"]


def test_no_blank_skill_post(client) -> None:
    """Create stays teach-a-task POST { name } from a capture. No empty stub."""
    blank = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Blank", "body": "# empty"},
    )
    assert blank.status_code == 422
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []
