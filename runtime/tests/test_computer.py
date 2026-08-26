# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.computer import WIDTH, HEIGHT, png_size
from tests.conftest import AUTH

CHANNEL = "snorlax-bot-group"
SEED = "snorlax-bot"
PNG_SIG = b"\x89PNG\r\n\x1a\n"


def test_get_computer_shape_for_agent(client) -> None:
    response = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["hasSandbox"] is True
    assert body["width"] == 1280
    assert body["height"] == 800
    assert body["imageUrl"] == f"/v1/agents/{SEED}/computer/image"
    assert set(body) == {"hasSandbox", "width", "height", "imageUrl"}


def test_computer_image_is_bearer_png(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    url = listed["imageUrl"]
    denied = client.get(url)
    assert denied.status_code == 401
    bad = client.get(url, headers={"Authorization": "Bearer nope"})
    assert bad.status_code == 401
    ok = client.get(url, headers=AUTH)
    assert ok.status_code == 200
    assert ok.headers["content-type"].startswith("image/png")
    assert ok.content.startswith(PNG_SIG)
    assert png_size(ok.content) == (WIDTH, HEIGHT)
    assert len(ok.content) > 200


def test_computer_png_is_live_framebuffer_not_a_shared_asset(client) -> None:
    seed = client.get(f"/v1/agents/{SEED}/computer/image", headers=AUTH)
    other = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Chip"},
    )
    assert other.status_code == 201
    other_id = other.json()["id"]
    chip = client.get(f"/v1/agents/{other_id}/computer/image", headers=AUTH)
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
    image = client.get(f"/v1/agents/{CHANNEL}/computer/image", headers=AUTH)
    assert image.status_code == 409
    assert image.json() == {"error": "computer preview is agent-only"}


def test_unknown_agent_computer_is_404(client) -> None:
    listed = client.get("/v1/agents/no-such/computer", headers=AUTH)
    assert listed.status_code == 404
    image = client.get("/v1/agents/no-such/computer/image", headers=AUTH)
    assert image.status_code == 404


def test_has_sandbox_false_omits_image_url(client) -> None:
    client.app.state.computer.detach(SEED)
    response = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body == {"hasSandbox": False, "width": 1280, "height": 800}
    assert "imageUrl" not in body
    missing = client.get(f"/v1/agents/{SEED}/computer/image", headers=AUTH)
    assert missing.status_code == 404


def test_no_click_key_mouse_api(client) -> None:
    for path in (
        f"/v1/agents/{SEED}/computer/click",
        f"/v1/agents/{SEED}/computer/key",
        f"/v1/agents/{SEED}/computer/mouse",
        f"/v1/agents/{SEED}/computer/input",
    ):
        posted = client.post(path, headers=AUTH, json={"x": 1, "y": 1})
        assert posted.status_code in {404, 405}


def test_idle_desktop_still_has_sandbox(client, tmp_path) -> None:
    assert not (tmp_path / "workspaces" / "agents" / SEED).exists()
    body = client.get(f"/v1/agents/{SEED}/computer", headers=AUTH).json()
    assert body["hasSandbox"] is True
    png = client.get(body["imageUrl"], headers=AUTH)
    assert png.status_code == 200
    assert png_size(png.content) == (1280, 800)
