# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.computer import WIDTH, HEIGHT, png_size
from tests.conftest import AUTH

import pytest

CHANNEL = "snorlax-bot-group"
SEED = "snorlax-bot"
PNG_SIG = b"\x89PNG\r\n\x1a\n"
SCREENSHOT = f"/v1/agents/{SEED}/computer/screenshot"


def test_get_computer_200_with_png(client) -> None:
    response = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["hasSandbox"] is True
    assert body["width"] == 1280
    assert body["height"] == 800
    assert body["imageUrl"] == SCREENSHOT
    assert body["driving"] == "idle"
    assert set(body) == {"hasSandbox", "width", "height", "imageUrl", "driving"}
    denied = client.get(SCREENSHOT)
    assert denied.status_code == 401
    png = client.get(SCREENSHOT, headers=AUTH)
    assert png.status_code == 200
    assert png.headers["content-type"].startswith("image/png")
    assert png.content.startswith(PNG_SIG)
    assert png_size(png.content) == (WIDTH, HEIGHT)
    assert len(png.content) > 200


def test_computer_png_is_live_framebuffer_not_a_shared_asset(client) -> None:
    seed = client.get(SCREENSHOT, headers=AUTH)
    other = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Chip"},
    )
    assert other.status_code == 201
    other_id = other.json()["id"]
    chip = client.get(
        f"/v1/agents/{other_id}/computer/screenshot", headers=AUTH
    )
    assert seed.status_code == 200
    assert chip.status_code == 200
    assert seed.content.startswith(PNG_SIG)
    assert chip.content.startswith(PNG_SIG)
    assert png_size(seed.content) == (1280, 800)
    assert png_size(chip.content) == (1280, 800)
    assert seed.content != chip.content


def test_channel_computer_is_409(client) -> None:
    listed = client.get(f"/v1/agents/{CHANNEL}/computer", headers=AUTH)
    assert listed.status_code == 409
    assert listed.json() == {"error": "computer preview is agent-only"}
    shot = client.get(
        f"/v1/agents/{CHANNEL}/computer/screenshot", headers=AUTH
    )
    assert shot.status_code == 409
    assert shot.json() == {"error": "computer preview is agent-only"}


def test_missing_agent_computer_is_404(client) -> None:
    listed = client.get("/v1/agents/no-such/computer", headers=AUTH)
    assert listed.status_code == 404
    shot = client.get("/v1/agents/no-such/computer/screenshot", headers=AUTH)
    assert shot.status_code == 404


def test_no_sandbox_omits_image_url(client) -> None:
    client.app.state.computer.detach(SEED)
    response = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body == {"hasSandbox": False, "width": 1280, "height": 800}
    assert "imageUrl" not in body
    assert "driving" not in body
    missing = client.get(SCREENSHOT, headers=AUTH)
    assert missing.status_code == 404


def test_no_legacy_click_scroll_routes(client) -> None:
    for path in (
        f"/v1/agents/{SEED}/computer/click",
        f"/v1/agents/{SEED}/computer/scroll",
        f"/v1/agents/{SEED}/computer/mouse",
        f"/v1/agents/{SEED}/computer/input",
    ):
        posted = client.post(path, headers=AUTH, json={"x": 1, "y": 1})
        assert posted.status_code in {404, 405}


def test_session_201_and_done_204(client) -> None:
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 201
    body = opened.json()
    assert set(body) == {"sessionId"}
    session_id = body["sessionId"]
    assert session_id.startswith("sess_")
    assert len(session_id) > 8
    again = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert again.status_code == 201
    assert again.json() == {"sessionId": session_id}
    preview = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert preview["driving"] == "user"
    unknown = client.delete(
        f"/v1/agents/{SEED}/computer/session/sess_nope", headers=AUTH
    )
    assert unknown.status_code == 404
    assert unknown.json() == {"error": "no computer session"}
    still = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert still["driving"] == "user"
    done = client.delete(
        f"/v1/agents/{SEED}/computer/session/{session_id}", headers=AUTH
    )
    assert done.status_code == 204
    assert done.content == b""
    missing = client.delete(
        f"/v1/agents/{SEED}/computer/session/{session_id}", headers=AUTH
    )
    assert missing.status_code == 404
    idle = client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert idle.status_code == 204
    after = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert after["driving"] == "idle"


def test_pointer_and_key_while_session_open(client) -> None:
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 201
    moved = client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 640, "y": 400, "type": "move"},
    )
    assert moved.status_code == 200
    clicked = client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 100, "y": 80, "type": "click"},
    )
    assert clicked.status_code == 200
    typed = client.post(
        f"/v1/agents/{SEED}/computer/key",
        headers=AUTH,
        json={"key": "a", "type": "type"},
    )
    assert typed.status_code == 200
    with_text = client.post(
        f"/v1/agents/{SEED}/computer/key",
        headers=AUTH,
        json={"key": "x", "type": "type", "text": "hi"},
    )
    assert with_text.status_code == 200
    down = client.post(
        f"/v1/agents/{SEED}/computer/key",
        headers=AUTH,
        json={"key": "Enter", "type": "down"},
    )
    assert down.status_code == 200
    png = client.get(SCREENSHOT, headers=AUTH)
    assert png.status_code == 200
    assert png.content.startswith(PNG_SIG)
    assert png_size(png.content) == (WIDTH, HEIGHT)
    client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    last = client.get(SCREENSHOT, headers=AUTH)
    assert last.status_code == 200
    assert last.content.startswith(PNG_SIG)
    assert png_size(last.content) == (WIDTH, HEIGHT)


def test_pointer_key_without_session_is_409(client) -> None:
    pointer = client.post(
        f"/v1/agents/{SEED}/computer/pointer",
        headers=AUTH,
        json={"x": 1, "y": 1, "type": "click"},
    )
    assert pointer.status_code == 409
    assert pointer.json() == {"error": "no computer session"}
    key = client.post(
        f"/v1/agents/{SEED}/computer/key",
        headers=AUTH,
        json={"key": "a", "type": "type"},
    )
    assert key.status_code == 409
    assert key.json() == {"error": "no computer session"}


def test_agent_driven_tools_409_while_session(client) -> None:
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 201
    blocked = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": 'SNORLAX_TOOL computer_click {"x": 10, "y": 20}'},
    )
    assert blocked.status_code == 409
    assert blocked.json() == {"error": "computer session is active"}
    from snorlax_runtime.computer import ComputerError

    with pytest.raises(ComputerError) as exc:
        client.app.state.computer.pointer(SEED, 10, 20, "click", user=False)
    assert exc.value.status == 409
    assert exc.value.message == "computer session is active"
    preview = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert preview["driving"] == "user"
    client.delete(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    client.app.state.computer.pointer(SEED, 10, 20, "click", user=False)
    after = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert after["driving"] == "agent"
    ok = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "hi"},
    )
    assert ok.status_code == 200


def test_channel_session_pointer_key_are_409(client) -> None:
    for method, path, body in (
        ("POST", f"/v1/agents/{CHANNEL}/computer/session", None),
        ("DELETE", f"/v1/agents/{CHANNEL}/computer/session", None),
        ("DELETE", f"/v1/agents/{CHANNEL}/computer/session/sess_nope", None),
        (
            "POST",
            f"/v1/agents/{CHANNEL}/computer/pointer",
            {"x": 1, "y": 1, "type": "click"},
        ),
        (
            "POST",
            f"/v1/agents/{CHANNEL}/computer/key",
            {"key": "a", "type": "type"},
        ),
    ):
        response = client.request(method, path, headers=AUTH, json=body)
        assert response.status_code == 409
        assert response.json() == {"error": "computer session is agent-only"}


def test_missing_agent_session_pointer_key_are_404(client) -> None:
    for method, path, body in (
        ("POST", "/v1/agents/no-such/computer/session", None),
        ("DELETE", "/v1/agents/no-such/computer/session", None),
        ("DELETE", "/v1/agents/no-such/computer/session/sess_nope", None),
        (
            "POST",
            "/v1/agents/no-such/computer/pointer",
            {"x": 1, "y": 1, "type": "click"},
        ),
        (
            "POST",
            "/v1/agents/no-such/computer/key",
            {"key": "a", "type": "type"},
        ),
    ):
        response = client.request(method, path, headers=AUTH, json=body)
        assert response.status_code == 404


def test_session_without_sandbox_is_404(client) -> None:
    client.app.state.computer.detach(SEED)
    opened = client.post(f"/v1/agents/{SEED}/computer/session", headers=AUTH)
    assert opened.status_code == 404


def test_idle_desktop_still_returns_1280x800_shot(client, tmp_path) -> None:
    assert not (tmp_path / "workspaces" / "agents" / SEED).exists()
    body = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert body["hasSandbox"] is True
    png = client.get(body["imageUrl"], headers=AUTH)
    assert png.status_code == 200
    assert png_size(png.content) == (1280, 800)


def test_legacy_computer_image_path_is_gone(client) -> None:
    gone = client.get(f"/v1/agents/{SEED}/computer/image", headers=AUTH)
    assert gone.status_code == 404
