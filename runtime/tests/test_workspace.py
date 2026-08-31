# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.tools import MAX_FILE_BYTES, pane_workspace
from tests.conftest import AUTH, without_seed_skill_dirs
from tests.test_tools import _send

CHANNEL = "snorlax-bot-group"
SEED = "snorlax-bot"


def test_empty_workspace_lists_no_fake_files(client, tmp_path) -> None:
    response = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["root"] == f"workspaces/agents/{SEED}"
    assert body["path"] == "."
    names = {row["name"] for row in body["entries"]}
    assert without_seed_skill_dirs(names) == set()
    assert names == {"teammates", "routines"}
    assert "projectPath" not in body
    assert "folderPath" not in body
    assert not body["root"].startswith("/")
    assert "/Users/" not in body["root"]


def test_list_and_read_text_file(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    (root / "src").mkdir(parents=True, exist_ok=True)
    (root / "README.md").write_text("# hi\n", encoding="utf-8")
    (root / "src" / "app.py").write_text('print("ok")\n', encoding="utf-8")

    listed = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH)
    assert listed.status_code == 200
    body = listed.json()
    assert body["root"] == f"workspaces/agents/{SEED}"
    names = {row["name"]: row for row in body["entries"]}
    assert names["src"]["kind"] == "dir"
    assert "size" not in names["src"] or names["src"]["size"] is None
    assert names["README.md"]["kind"] == "file"
    assert names["README.md"]["size"] == 5

    nested = client.get(
        f"/v1/agents/{SEED}/workspace",
        headers=AUTH,
        params={"path": "src"},
    )
    assert nested.status_code == 200
    nested_body = nested.json()
    assert nested_body["path"] == "src"
    assert nested_body["entries"][0]["name"] == "app.py"
    assert nested_body["entries"][0]["kind"] == "file"
    assert nested_body["entries"][0]["size"] == (
        root / "src" / "app.py"
    ).stat().st_size

    read = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "src/app.py"},
    )
    assert read.status_code == 200
    file_body = read.json()
    assert file_body["path"] == "src/app.py"
    assert file_body["content"] == 'print("ok")\n'
    assert file_body["truncated"] is False


def test_path_jail_rejects_escape(client, tmp_path) -> None:
    secret = tmp_path / "secret.txt"
    secret.write_text("leaked", encoding="utf-8")
    root = tmp_path / "workspaces" / "agents" / SEED
    root.mkdir(parents=True, exist_ok=True)
    (root / "ok.txt").write_text("in", encoding="utf-8")

    for params in (
        {"path": "../secret.txt"},
        {"path": "/etc/passwd"},
        {"path": "foo/../../secret.txt"},
    ):
        listed = client.get(
            f"/v1/agents/{SEED}/workspace", headers=AUTH, params=params
        )
        assert listed.status_code == 422, params
        assert listed.json() == {"error": "path escapes workspace"}
        read = client.get(
            f"/v1/agents/{SEED}/workspace/file",
            headers=AUTH,
            params=params,
        )
        assert read.status_code == 422, params
        assert read.json() == {"error": "path escapes workspace"}


def test_missing_path_is_404(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    root.mkdir(parents=True, exist_ok=True)
    missing_dir = client.get(
        f"/v1/agents/{SEED}/workspace",
        headers=AUTH,
        params={"path": "nope"},
    )
    assert missing_dir.status_code == 404
    missing_file = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "nope.txt"},
    )
    assert missing_file.status_code == 404
    unknown = client.get("/v1/agents/no-such/workspace", headers=AUTH)
    assert unknown.status_code == 404
    unknown_file = client.get(
        "/v1/agents/no-such/workspace/file",
        headers=AUTH,
        params={"path": "a.txt"},
    )
    assert unknown_file.status_code == 404


def test_binary_file_is_422_not_hex(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    root.mkdir(parents=True, exist_ok=True)
    (root / "blob.bin").write_bytes(b"\x00\xff\xfe binary")
    response = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "blob.bin"},
    )
    assert response.status_code == 422
    assert response.json() == {"error": "binary / too large"}
    assert "hex" not in response.text.lower()
    assert "\\x00" not in response.text


def test_oversize_text_is_truncated(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    root.mkdir(parents=True, exist_ok=True)
    payload = "a" * (MAX_FILE_BYTES + 80)
    (root / "big.txt").write_text(payload, encoding="utf-8")
    response = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "big.txt"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["truncated"] is True
    assert body["content"] == "a" * MAX_FILE_BYTES


def test_workspace_requires_bearer(client) -> None:
    listed = client.get(f"/v1/agents/{SEED}/workspace")
    assert listed.status_code == 401
    read = client.get(
        f"/v1/agents/{SEED}/workspace/file", params={"path": "a.txt"}
    )
    assert read.status_code == 401
    bad = client.get(
        f"/v1/agents/{SEED}/workspace",
        headers={"Authorization": "Bearer nope"},
    )
    assert bad.status_code == 401


def test_one_to_one_pane_is_isolated(client, tmp_path) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "Other"}).json()
    seed_root = tmp_path / "workspaces" / "agents" / SEED
    other_root = tmp_path / "workspaces" / "agents" / other["id"]
    seed_root.mkdir(parents=True, exist_ok=True)
    other_root.mkdir(parents=True, exist_ok=True)
    (seed_root / "private.txt").write_text("seed-only", encoding="utf-8")
    (other_root / "other.txt").write_text("other-only", encoding="utf-8")

    seed_list = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    seed_names = {row["name"] for row in seed_list["entries"]}
    assert without_seed_skill_dirs(seed_names) == {"private.txt"}
    assert "other.txt" not in seed_names
    assert seed_list["root"] == f"workspaces/agents/{SEED}"

    other_list = client.get(
        f"/v1/agents/{other['id']}/workspace", headers=AUTH
    ).json()
    other_names = {row["name"] for row in other_list["entries"]}
    assert without_seed_skill_dirs(other_names) == {"other.txt"}
    assert "private.txt" not in other_names
    assert other_list["root"] == f"workspaces/agents/{other['id']}"

    leaked = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "other.txt"},
    )
    assert leaked.status_code == 404


def test_shared_project_channel_root_not_one_to_one(client, tmp_path) -> None:
    patched = client.patch(
        f"/v1/agents/{CHANNEL}",
        headers=AUTH,
        json={"sharedProject": True},
    )
    assert patched.status_code == 200
    channel_root = tmp_path / "workspaces" / "channels" / CHANNEL
    agent_root = tmp_path / "workspaces" / "agents" / SEED
    channel_root.mkdir(parents=True, exist_ok=True)
    agent_root.mkdir(parents=True, exist_ok=True)
    (channel_root / "shared.py").write_text("chan", encoding="utf-8")
    (agent_root / "private.py").write_text("solo", encoding="utf-8")

    channel_list = client.get(
        f"/v1/agents/{CHANNEL}/workspace", headers=AUTH
    ).json()
    assert channel_list["root"] == f"workspaces/channels/{CHANNEL}"
    assert {row["name"] for row in channel_list["entries"]} == {"shared.py"}

    agent_list = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    assert agent_list["root"] == f"workspaces/agents/{SEED}"
    assert without_seed_skill_dirs(
        {row["name"] for row in agent_list["entries"]}
    ) == {"private.py"}

    # B's channel workspace is not painted inside A's 1:1 pane.
    missing = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "shared.py"},
    )
    assert missing.status_code == 404


def test_channel_shared_project_off_uses_first_member_workspace(
    client, tmp_path
) -> None:
    seed_root = tmp_path / "workspaces" / "agents" / SEED
    channel_root = tmp_path / "workspaces" / "channels" / CHANNEL
    seed_root.mkdir(parents=True, exist_ok=True)
    channel_root.mkdir(parents=True, exist_ok=True)
    (seed_root / "member.py").write_text("first", encoding="utf-8")
    (channel_root / "ignored.py").write_text("chan", encoding="utf-8")

    listed = client.get(f"/v1/agents/{CHANNEL}/workspace", headers=AUTH).json()
    assert listed["root"] == f"workspaces/agents/{SEED}"
    assert without_seed_skill_dirs(
        {row["name"] for row in listed["entries"]}
    ) == {"member.py"}

    read = client.get(
        f"/v1/agents/{CHANNEL}/workspace/file",
        headers=AUTH,
        params={"path": "member.py"},
    )
    assert read.status_code == 200
    assert read.json()["content"] == "first"


def test_pane_workspace_matches_workspace_for_roots(tmp_path) -> None:
    agent = {"id": "snorlax-bot", "kind": "agent", "memberIds": []}
    channel = {
        "id": "snorlax-bot-group",
        "kind": "channel",
        "memberIds": ["snorlax-bot", "other"],
        "sharedProject": False,
    }
    assert pane_workspace(tmp_path, agent) == (
        tmp_path / "workspaces" / "agents" / "snorlax-bot"
    ).resolve()
    assert pane_workspace(tmp_path, channel) == (
        tmp_path / "workspaces" / "agents" / "snorlax-bot"
    ).resolve()
    on = {**channel, "sharedProject": True}
    assert pane_workspace(tmp_path, on) == (
        tmp_path / "workspaces" / "channels" / "snorlax-bot-group"
    ).resolve()


def test_write_file_round_is_visible_on_get(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        SEED,
        'Write a file named app.py containing print("ok")',
    )
    assert status == 200
    assert any(n == "tool.done" for n, _ in events)
    listed = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    assert listed["root"] == f"workspaces/agents/{SEED}"
    names = {row["name"] for row in listed["entries"]}
    assert "app.py" in names
    read = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "app.py"},
    )
    assert read.status_code == 200
    assert read.json()["content"] == 'print("ok")'


def test_read_directory_is_422(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    (root / "src").mkdir(parents=True, exist_ok=True)
    response = client.get(
        f"/v1/agents/{SEED}/workspace/file",
        headers=AUTH,
        params={"path": "src"},
    )
    assert response.status_code == 422
    assert response.json() == {"error": "not a file"}


def test_list_file_path_is_422(client, tmp_path) -> None:
    root = tmp_path / "workspaces" / "agents" / SEED
    root.mkdir(parents=True, exist_ok=True)
    (root / "a.txt").write_text("x", encoding="utf-8")
    response = client.get(
        f"/v1/agents/{SEED}/workspace",
        headers=AUTH,
        params={"path": "a.txt"},
    )
    assert response.status_code == 422
    assert response.json() == {"error": "not a directory"}


def test_default_path_is_dot(client) -> None:
    with_path = client.get(
        f"/v1/agents/{SEED}/workspace",
        headers=AUTH,
        params={"path": "."},
    ).json()
    omitted = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    assert with_path == omitted
    assert omitted["path"] == "."
