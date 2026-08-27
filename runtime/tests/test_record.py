# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from snorlax_runtime.computer import png_size
from snorlax_runtime.cron import TAIPEI
from snorlax_runtime.scheduler import fire_due_routines
from snorlax_runtime.skills import find_skill, load_skills, parse_skill_markdown
from tests.conftest import AUTH, user_skill_files, user_skill_rows

CHANNEL = "snorlax-bot-group"
SEED = "snorlax-bot"
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def _open_session(client) -> str:
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 201
    return opened.json()["sessionId"]


def test_record_start_stop_during_session(client, tmp_path: Path) -> None:
    _open_session(client)
    preview = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert preview["driving"] == "user"
    assert preview["recording"] is False
    started = client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert started.status_code == 201
    assert started.json() == {"recording": True}
    again = client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert again.status_code == 409
    assert again.json() == {"error": "already recording"}
    live = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert live["recording"] is True
    assert live["driving"] == "user"
    skills_root = tmp_path / "skills"
    stopped = client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert stopped.status_code == 204
    assert stopped.content == b""
    assert not user_skill_files(skills_root)
    idle = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert idle["recording"] is False
    assert idle["driving"] == "user"
    again_stop = client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert again_stop.status_code == 204
    client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    after = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert after["recording"] is False
    assert after["driving"] == "idle"


def test_record_without_session_is_409(client) -> None:
    started = client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert started.status_code == 409
    assert started.json() == {"error": "no computer session"}
    stopped = client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    assert stopped.status_code == 409
    assert stopped.json() == {"error": "no computer session"}
    preview = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert preview["recording"] is False
    assert preview["hasSandbox"] is True


def test_save_writes_skill_md_v09_can_list_and_run(
    client, tmp_path: Path
) -> None:
    _open_session(client)
    assert client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH).status_code == 201
    clicked = client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 100, "y": 80, "type": "click"},
    )
    assert clicked.status_code == 200
    typed = client.post(
        f"/v1/agents/{SEED}/computer/key",
        headers=AUTH,
        json={"key": "x", "type": "type", "text": "hello"},
    )
    assert typed.status_code == 200
    assert client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH).status_code == 204
    saved = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Demo click"},
    )
    assert saved.status_code == 201
    assert saved.json() == {"id": "demo-click", "name": "Demo click"}
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert {"id": "demo-click", "name": "Demo click"} in listed.json()
    skill_path = tmp_path / "skills" / "demo-click" / "SKILL.md"
    assert skill_path.is_file()
    text = skill_path.read_text(encoding="utf-8")
    parsed = parse_skill_markdown(
        text, source="skillsDir", path="demo-click/SKILL.md"
    )
    assert parsed is not None
    assert parsed.name == "Demo click"
    assert parsed.description
    assert "computer_click" in parsed.body
    assert "x=100" in parsed.body
    assert "y=80" in parsed.body
    assert "computer_key" in parsed.body
    assert "hello" in parsed.body
    start = tmp_path / "skills" / "demo-click" / "start.png"
    end = tmp_path / "skills" / "demo-click" / "end.png"
    assert start.is_file() and start.read_bytes().startswith(PNG_SIG)
    assert end.is_file() and end.read_bytes().startswith(PNG_SIG)
    assert png_size(start.read_bytes()) == (1280, 800)
    loaded = load_skills(client.app.state.store.data_dir)
    found = find_skill(loaded, "Demo click")
    assert found is not None
    assert found.body == parsed.body
    routine = client.post(
        f"/v1/agents/{SEED}/routines",
        headers=AUTH,
        json={
            "name": "Replay demo",
            "skill": "Demo click",
            "schedule": "0 9 * * 1-5",
        },
    )
    assert routine.status_code == 201
    stored_skill = routine.json()["skill"]
    assert find_skill(loaded, stored_skill) is not None
    routines = client.get(f"/v1/agents/{SEED}/routines", headers=AUTH)
    assert routines.status_code == 200
    assert any(
        row["name"] == "Replay demo" and find_skill(loaded, row["skill"]) is not None
        for row in routines.json()
    )
    # Takeover pauses the agent; Done (close session) before a v0.9 fire.
    assert (
        client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH).status_code
        == 204
    )

    async def _run():
        return await fire_due_routines(
            client.app.state.store,
            client.app.state.backend,
            now=datetime(2026, 8, 26, 9, 0, tzinfo=TAIPEI),
        )

    assert client.portal is not None
    fired = client.portal.call(_run)
    assert len(fired) >= 1
    assert fired[0]["message"] is not None
    messages = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH)
    assert messages.status_code == 200
    assert any(
        row.get("routineName") == "Replay demo" and row.get("senderId") == SEED
        for row in messages.json()
    )


def test_discard_writes_no_skill_md(client, tmp_path: Path) -> None:
    _open_session(client)
    client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 10, "y": 20, "type": "click"},
    )
    client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    skills_root = tmp_path / "skills"
    before = user_skill_files(skills_root)
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert listed.status_code == 200
    assert user_skill_rows(listed.json()) == []
    assert before == []
    client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    missing = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Should not save"},
    )
    assert missing.status_code == 422
    assert missing.json() == {"error": "no pending capture"}
    after = user_skill_files(skills_root)
    assert after == []


def test_next_record_discards_pending_capture(client, tmp_path: Path) -> None:
    _open_session(client)
    client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 10, "y": 20, "type": "click"},
    )
    client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 200, "y": 90, "type": "click"},
    )
    client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    saved = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Second take"},
    )
    assert saved.status_code == 201
    assert saved.json() == {"id": "second-take", "name": "Second take"}
    text = (tmp_path / "skills" / "second-take" / "SKILL.md").read_text(
        encoding="utf-8"
    )
    assert "x=200" in text
    assert "y=90" in text
    assert "x=10" not in text


def test_save_while_recording_is_422(client) -> None:
    _open_session(client)
    client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    blocked = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Too soon"},
    )
    assert blocked.status_code == 422
    assert blocked.json() == {"error": "no pending capture"}
    client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    saved = client.post(
        f"/v1/agents/{SEED}/skills",
        headers=AUTH,
        json={"name": "Now ok"},
    )
    assert saved.status_code == 201
    assert saved.json() == {"id": "now-ok", "name": "Now ok"}


def test_empty_name_is_422(client) -> None:
    _open_session(client)
    client.post(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    client.delete(f"/v1/agents/{SEED}/computer/record", headers=AUTH)
    for body in ({"name": ""}, {"name": "   "}, {}):
        response = client.post(
            f"/v1/agents/{SEED}/skills",
            headers=AUTH,
            json=body,
        )
        assert response.status_code == 422
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH)
    assert user_skill_rows(listed.json()) == []


def test_channel_record_and_save_are_409(client) -> None:
    for method, path, body in (
        ("POST", f"/v1/agents/{CHANNEL}/computer/record", None),
        ("DELETE", f"/v1/agents/{CHANNEL}/computer/record", None),
        (
            "POST",
            f"/v1/agents/{CHANNEL}/skills",
            {"name": "Nope"},
        ),
    ):
        response = client.request(method, path, headers=AUTH, json=body)
        assert response.status_code == 409
        assert response.json() == {"error": "computer session is agent-only"}


def test_missing_agent_record_and_save_are_404(client) -> None:
    for method, path, body in (
        ("POST", "/v1/agents/no-such/computer/record", None),
        ("DELETE", "/v1/agents/no-such/computer/record", None),
        ("POST", "/v1/agents/no-such/skills", {"name": "Nope"}),
    ):
        response = client.request(method, path, headers=AUTH, json=body)
        assert response.status_code == 404
