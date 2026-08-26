# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.computer import WIDTH, HEIGHT, png_size
from tests.conftest import AUTH

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
    assert set(body) == {"hasSandbox", "width", "height", "imageUrl"}
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
    missing = client.get(SCREENSHOT, headers=AUTH)
    assert missing.status_code == 404


def test_no_input_routes(client) -> None:
    for path in (
        f"/v1/agents/{SEED}/computer/click",
        f"/v1/agents/{SEED}/computer/key",
        f"/v1/agents/{SEED}/computer/scroll",
        f"/v1/agents/{SEED}/computer/mouse",
        f"/v1/agents/{SEED}/computer/input",
    ):
        posted = client.post(path, headers=AUTH, json={"x": 1, "y": 1})
        assert posted.status_code in {404, 405}


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
