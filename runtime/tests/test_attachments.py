# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)
PDF = b"%PDF-1.4\n% test file\n"
TXT = b"hello from notes.txt\n"


def _upload(client, dest: str, name: str, data: bytes, mime: str, headers=AUTH):
    return client.post(
        f"/v1/agents/{dest}/attachments",
        headers=headers,
        files={"file": (name, data, mime)},
    )


def test_upload_image_201_kind_image(client) -> None:
    created = _upload(client, SEED, "shot.png", PNG, "image/png")
    assert created.status_code == 201
    body = created.json()
    assert body["kind"] == "image"
    assert body["name"] == "shot.png"
    assert body["size"] == len(PNG)
    assert body["url"] == f"/v1/attachments/{body['id']}"
    assert set(body) == {"id", "kind", "name", "url", "size"}


def test_upload_pdf_201_kind_file(client) -> None:
    created = _upload(client, SEED, "doc.pdf", PDF, "application/pdf")
    assert created.status_code == 201
    body = created.json()
    assert body["kind"] == "file"
    assert body["name"] == "doc.pdf"
    assert body["size"] == len(PDF)
    assert body["url"].startswith("/v1/attachments/")


def test_upload_over_10mb_422(client) -> None:
    huge = b"x" * (10 * 1024 * 1024 + 1)
    created = _upload(client, SEED, "big.bin", huge, "application/octet-stream")
    assert created.status_code == 422
    assert created.json()["error"] == "Max 10MB."
    image = _upload(client, SEED, "big.png", huge, "image/png")
    assert image.status_code == 422
    assert image.json()["error"] == "Max 10MB."


def test_upload_video_201_kind_video(client) -> None:
    created = _upload(client, SEED, "clip.mp4", b"not-really-video", "video/mp4")
    assert created.status_code == 201
    body = created.json()
    assert body["kind"] == "video"
    assert body["name"] == "clip.mp4"
    assert body["size"] == len(b"not-really-video")
    assert body["url"] == f"/v1/attachments/{body['id']}"
    assert set(body) == {"id", "kind", "name", "url", "size"}


def test_upload_video_over_50mb_422(client) -> None:
    huge = b"x" * (50 * 1024 * 1024 + 1)
    created = _upload(client, SEED, "clip.mp4", huge, "video/mp4")
    assert created.status_code == 422
    assert created.json()["error"] == "Max 50MB."


def test_upload_empty_file_422(client) -> None:
    created = _upload(client, SEED, "empty.txt", b"", "text/plain")
    assert created.status_code == 422
    assert created.json()["error"] == "Empty file."


def test_get_attachment_requires_bearer(client) -> None:
    created = _upload(client, SEED, "shot.png", PNG, "image/png").json()
    url = created["url"]
    denied = client.get(url)
    assert denied.status_code == 401
    fetched = client.get(url, headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == PNG
    assert fetched.headers["content-type"].startswith("image/png")


def test_message_attachment_ids_empty_content_200(client) -> None:
    created = _upload(client, SEED, "notes.txt", TXT, "text/plain").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        events = parse_sse("".join(response.iter_text()))
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    users = [m for m in listed if m["role"] == "user"]
    assert users
    row = users[0]
    assert row["content"] == ""
    assert row["attachments"][0]["id"] == created["id"]
    assert row["attachments"][0]["kind"] == "file"
    assert row["attachments"][0]["name"] == "notes.txt"
    assert row["attachments"][0]["url"] == created["url"]
    assert row["attachments"][0]["size"] == len(TXT)
    assistants = [m for m in listed if m["role"] == "assistant"]
    assert assistants
    assert assistants[0]["attachments"] == []
    deltas = "".join(p["delta"] for n, p in events if n == "message.delta")
    assert "hello from notes.txt" in deltas


def test_empty_content_plus_video_attachment_200(client) -> None:
    blob = b"not-really-video"
    created = _upload(client, SEED, "clip.mp4", blob, "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    users = [m for m in listed if m["role"] == "user"]
    assert users
    row = users[0]
    assert row["content"] == ""
    att = row["attachments"][0]
    assert att["kind"] == "video"
    assert att["id"] == created["id"]
    assert att["name"] == "clip.mp4"
    assert att["url"] == created["url"]
    assert att["size"] == len(blob)
    assert set(att) == {"id", "kind", "name", "url", "size"}
    fetched = client.get(att["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == blob
    denied = client.get(att["url"])
    assert denied.status_code == 401


def test_video_bytes_not_fed_to_model(client) -> None:
    blob = b"secret-video-bytes-do-not-send"
    created = _upload(client, SEED, "clip.mp4", blob, "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "watch this", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    last = client.app.state.backend.last_messages
    packed = str(last)
    assert blob.decode("ascii") not in packed
    assert "secret-video-bytes" not in packed
    import base64

    assert base64.b64encode(blob).decode("ascii") not in packed
    assert "image_url" not in packed
    assert "user attached clip.mp4" in packed


def test_unknown_video_id_422(client) -> None:
    missing = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "", "attachmentIds": ["att_nope"]},
    )
    assert missing.status_code == 422
    assert missing.json()["error"] == "Unknown attachment id"
    missing = client.post(
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "hi", "attachmentIds": ["att_nope"]},
    )
    assert missing.status_code == 422
    assert missing.json()["error"] == "Unknown attachment id"
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert listed == []


def test_foreign_attachment_id_422(client) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "Other"}).json()
    created = _upload(client, SEED, "shot.png", PNG, "image/png").json()
    foreign = client.post(
        f"/v1/agents/{other['id']}/messages",
        headers=AUTH,
        json={"content": "see this", "attachmentIds": [created["id"]]},
    )
    assert foreign.status_code == 422
    seed_msgs = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    other_msgs = client.get(f"/v1/agents/{other['id']}/messages", headers=AUTH).json()
    assert seed_msgs == []
    assert other_msgs == []


def test_image_bytes_included_in_model_turn(client) -> None:
    created = _upload(client, SEED, "shot.png", PNG, "image/png").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "look", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    last = client.app.state.backend.last_messages
    blob = str(last)
    assert "image_url" in blob
    import base64

    assert base64.b64encode(PNG).decode("ascii") in blob


def test_legacy_images_still_persist_off_model(client) -> None:
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={
            "content": "Look at this screenshot.",
            "images": [{"mime": "image/png", "data": "aGVsbG8="}],
        },
    ) as response:
        body = "".join(response.iter_text())
    events = parse_sse(body)
    deltas = "".join(p["delta"] for n, p in events if n == "message.delta")
    assert "aGVsbG8" not in deltas
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert listed[0]["images"]
    assert listed[0]["attachments"] == []


def test_one_to_one_isolation(client) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "B"}).json()
    created = _upload(client, SEED, "shot.png", PNG, "image/png").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "for A only", "attachmentIds": [created["id"]]},
    ) as response:
        "".join(response.iter_text())
    a_msgs = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    b_msgs = client.get(f"/v1/agents/{other['id']}/messages", headers=AUTH).json()
    assert a_msgs[0]["attachments"][0]["id"] == created["id"]
    assert all(not m.get("attachments") for m in b_msgs)


def test_channel_thread_only(client) -> None:
    created = _upload(client, CHANNEL, "notes.txt", TXT, "text/plain").json()
    with client.stream(
        "POST",
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        json={"content": "room file", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    channel_msgs = client.get(f"/v1/agents/{CHANNEL}/messages", headers=AUTH).json()
    seed_msgs = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    users = [m for m in channel_msgs if m["role"] == "user"]
    assert users[0]["attachments"][0]["id"] == created["id"]
    assert all(not m.get("attachments") for m in seed_msgs)


def test_missing_agent_404(client) -> None:
    missing = _upload(client, "no-such", "shot.png", PNG, "image/png")
    assert missing.status_code == 404


def test_video_one_to_one_isolation(client) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "B"}).json()
    created = _upload(client, SEED, "clip.mp4", b"only-a", "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "for A only", "attachmentIds": [created["id"]]},
    ) as response:
        "".join(response.iter_text())
    a_msgs = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    b_msgs = client.get(f"/v1/agents/{other['id']}/messages", headers=AUTH).json()
    assert a_msgs[0]["attachments"][0]["kind"] == "video"
    assert a_msgs[0]["attachments"][0]["id"] == created["id"]
    assert all(not m.get("attachments") for m in b_msgs)


def test_channel_video_thread_speaking_agent_only(client) -> None:
    inbox = client.post("/v1/agents", headers=AUTH, json={"name": "Inbox"}).json()
    status, _events = _send(
        client,
        CHANNEL,
        "@Inbox Write a file named room.mp4 containing shared-clip",
    )
    assert status == 200
    timeline = _msgs(client, CHANNEL)
    assert timeline
    thread = _msgs(client, CHANNEL, timeline[0]["id"])
    tools = [m for m in thread if m.get("kind") == "tool"]
    assert tools
    assert all(m.get("attachments") == [] for m in tools)
    speaking = [
        m
        for m in thread
        if m["senderId"] == inbox["id"] and m.get("kind", "message") == "message"
    ]
    assert speaking
    att = speaking[-1]["attachments"][0]
    assert att["name"] == "room.mp4"
    assert att["kind"] == "video"
    seed_msgs = _msgs(client, SEED)
    assert all(not m.get("attachments") for m in seed_msgs)


def test_no_chats_resource(client) -> None:
    created = client.post(
        f"/v1/chats/{SEED}/attachments",
        headers=AUTH,
        files={"file": ("shot.png", PNG, "image/png")},
    )
    assert created.status_code == 404


def _send(client, dest: str, content: str):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json={"content": content},
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body)


def _msgs(client, dest: str, thread_id: str | None = None):
    params = {"threadId": thread_id} if thread_id else None
    return client.get(
        f"/v1/agents/{dest}/messages", headers=AUTH, params=params
    ).json()


def test_assistant_write_file_binds_on_kind_message(client) -> None:
    status, events = _send(
        client, SEED, "Write a file named notes.txt containing hello"
    )
    assert status == 200
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[0]["attachments"] == []
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    assert assistants
    row = assistants[-1]
    assert row["attachments"]
    att = row["attachments"][0]
    assert att["kind"] == "file"
    assert att["name"] == "notes.txt"
    assert att["url"] == f"/v1/attachments/{att['id']}"
    assert att["size"] == len(b"hello")
    assert set(att) == {"id", "kind", "name", "url", "size"}
    denied = client.get(att["url"])
    assert denied.status_code == 401
    fetched = client.get(att["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == b"hello"
    dones = [p for n, p in events if n == "message.done"]
    tool_done = next(p for p in dones if p.get("kind") == "tool")
    assert tool_done["attachments"] == []
    text_done = next(
        p for p in reversed(dones) if p.get("kind", "message") == "message"
    )
    assert text_done["attachments"][0]["id"] == att["id"]


def test_assistant_screenshot_binds_kind_image(client) -> None:
    status, _events = _send(
        client, SEED, 'SNORLAX_TOOL computer_click {"x": 10, "y": 20}'
    )
    assert status == 200
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert all(m["attachments"] == [] for m in tools)
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    assert assistants
    row = assistants[-1]
    assert row["attachments"]
    att = row["attachments"][0]
    assert att["kind"] == "image"
    assert att["name"] == "screenshot.png"
    fetched = client.get(att["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content.startswith(b"\x89PNG")
    denied = client.get(att["url"])
    assert denied.status_code == 401


def test_assistant_write_image_path_is_kind_image(client) -> None:
    status, _events = _send(
        client, SEED, "Write a file named shot.png containing not-really-png"
    )
    assert status == 200
    listed = _msgs(client, SEED)
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    att = assistants[-1]["attachments"][0]
    assert att["kind"] == "image"
    assert att["name"] == "shot.png"


def test_assistant_empty_attachments_when_no_files(client) -> None:
    status, _events = _send(client, SEED, "hello there")
    assert status == 200
    listed = _msgs(client, SEED)
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    assert assistants
    assert assistants[0]["attachments"] == []


def test_assistant_write_video_binds_kind_video(client) -> None:
    status, _events = _send(
        client, SEED, "Write a file named clip.mp4 containing fake-video"
    )
    assert status == 200
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert all(m["attachments"] == [] for m in tools)
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    assert assistants
    att = assistants[-1]["attachments"][0]
    assert att["kind"] == "video"
    assert att["name"] == "clip.mp4"
    assert att["url"] == f"/v1/attachments/{att['id']}"
    fetched = client.get(att["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == b"fake-video"
    denied = client.get(att["url"])
    assert denied.status_code == 401
    last = client.app.state.backend.last_messages
    packed = str(last)
    assert "fake-video" not in packed or "clip.mp4" in packed
    import base64

    assert base64.b64encode(b"fake-video").decode("ascii") not in packed


def test_agent_attachment_skips_video_over_50mb() -> None:
    from snorlax_runtime.attachments import agent_attachment_from_bytes

    huge = b"x" * (50 * 1024 * 1024 + 1)
    assert agent_attachment_from_bytes("clip.mp4", huge, "video/mp4") is None
    ok = agent_attachment_from_bytes("clip.mp4", b"fake", "video/mp4")
    assert ok is not None
    assert ok["kind"] == "video"


def test_watch_video_is_offered() -> None:
    from snorlax_runtime.tools import offered_tool_definitions

    names = [
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    ]
    assert "watch_video" in names


def _watch_payload(attachment_id: str, **extra):
    payload = {
        "content": f'SNORLAX_TOOL watch_video {{"attachmentId": "{attachment_id}"}}'
    }
    payload.update(extra)
    return payload


def _watch(client, dest: str, attachment_id: str, **extra):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=_watch_payload(attachment_id, **extra),
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body)


def test_watch_video_success_text_not_bytes(client) -> None:
    import base64

    blob = b"secret-video-bytes-do-not-send"
    created = _upload(client, SEED, "clip.mp4", blob, "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "here is a clip", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        "".join(response.iter_text())
    status, events = _watch(client, SEED, created["id"])
    assert status == 200
    start = next(p for n, p in events if n == "tool.start")
    done = next(p for n, p in events if n == "tool.done")
    assert start["name"] == "watch_video"
    assert done["name"] == "watch_video"
    assert done["ok"] is True
    assert done["summary"] == "Watched clip.mp4"
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "Watched clip.mp4"
    listed = _msgs(client, SEED)
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools[0]["content"] == "Watched clip.mp4"
    last = client.app.state.backend.last_messages
    packed = str(last)
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert tool_roles
    result = str(tool_roles[0].get("content") or "")
    assert result.startswith("clip.mp4")
    assert not result.startswith("{")
    assert "secret-video-bytes" not in result
    assert blob.decode("ascii") not in result
    assert blob.decode("ascii") not in packed
    assert base64.b64encode(blob).decode("ascii") not in packed
    assert base64.b64encode(blob).decode("ascii") not in result
    assert "size:" in result
    listed_user = [m for m in listed if m["role"] == "user"]
    assert any(
        (m.get("attachments") or [{}])[0].get("kind") == "video"
        for m in listed_user
        if m.get("attachments")
    )


def test_watch_video_unknown_id_tool_error_post_200(client) -> None:
    status, events = _watch(client, SEED, "att_nope")
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["name"] == "watch_video"
    assert done["ok"] is False
    assert done["summary"] == "watch_video failed"
    listed = _msgs(client, SEED)
    users = [m for m in listed if m["role"] == "user"]
    assert users
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[0]["content"] == "watch_video failed"
    assistants = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind") != "tool"
    ]
    assert assistants
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert tool_roles
    assert "Error: unknown attachment id" in str(tool_roles[0].get("content") or "")


def test_watch_video_image_id_not_a_video(client) -> None:
    created = _upload(client, SEED, "shot.png", PNG, "image/png").json()
    status, events = _watch(client, SEED, created["id"])
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is False
    assert done["summary"] == "watch_video failed"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "Error: not a video" in str(tool_roles[0].get("content") or "")


def test_watch_video_file_id_not_a_video(client) -> None:
    created = _upload(client, SEED, "notes.txt", TXT, "text/plain").json()
    status, events = _watch(client, SEED, created["id"])
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is False
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "Error: not a video" in str(tool_roles[0].get("content") or "")


def test_watch_video_foreign_id_isolated(client) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "B"}).json()
    created = _upload(client, other["id"], "clip.mp4", b"only-b", "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{other['id']}/messages",
        headers=AUTH,
        json={"content": "for B", "attachmentIds": [created["id"]]},
    ) as response:
        "".join(response.iter_text())
    status, events = _watch(client, SEED, created["id"])
    assert status == 200
    done = next(p for n, p in events if n == "tool.done")
    assert done["ok"] is False
    assert done["summary"] == "watch_video failed"
    last = client.app.state.backend.last_messages
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert "Error: unknown attachment id" in str(tool_roles[0].get("content") or "")
    seed_msgs = _msgs(client, SEED)
    assert all(
        created["id"] not in [a.get("id") for a in (m.get("attachments") or [])]
        for m in seed_msgs
    )


def test_watch_video_channel_thread(client) -> None:
    inbox = client.post("/v1/agents", headers=AUTH, json={"name": "Inbox"}).json()
    blob = b"channel-clip-bytes"
    created = _upload(client, CHANNEL, "room.mp4", blob, "video/mp4").json()
    status, events = _send(
        client,
        CHANNEL,
        f'@Inbox SNORLAX_TOOL watch_video {{"attachmentId": "{created["id"]}"}}',
    )
    assert status == 200
    timeline = _msgs(client, CHANNEL)
    assert timeline
    thread = _msgs(client, CHANNEL, timeline[0]["id"])
    tools = [
        m
        for m in thread
        if m.get("kind") == "tool" and m["senderId"] == inbox["id"]
    ]
    assert tools
    assert tools[0]["content"] == "Watched room.mp4"
    dones = [p for n, p in events if n == "tool.done"]
    assert any(p.get("name") == "watch_video" and p.get("ok") is True for p in dones)
    last = client.app.state.backend.last_messages
    packed = str(last)
    assert blob.decode("ascii") not in packed
    tool_roles = [m for m in last if m.get("role") == "tool"]
    assert tool_roles
    assert tool_roles[0]["content"].startswith("room.mp4")
    seed_msgs = _msgs(client, SEED)
    assert all(not m.get("attachments") for m in seed_msgs)


def test_watch_video_not_auto_invoked(client) -> None:
    blob = b"not-auto-watched"
    created = _upload(client, SEED, "clip.mp4", blob, "video/mp4").json()
    with client.stream(
        "POST",
        f"/v1/agents/{SEED}/messages",
        headers=AUTH,
        json={"content": "watch this", "attachmentIds": [created["id"]]},
    ) as response:
        assert response.status_code == 200
        events = parse_sse("".join(response.iter_text()))
    assert not any(
        n == "tool.start" and p.get("name") == "watch_video" for n, p in events
    )
    assert not any(
        n == "tool.done" and p.get("name") == "watch_video" for n, p in events
    )
    listed = _msgs(client, SEED)
    assert not any(
        m.get("kind") == "tool" and "Watched" in (m.get("content") or "")
        for m in listed
    )
    last = client.app.state.backend.last_messages
    packed = str(last)
    assert "user attached clip.mp4" in packed
    assert blob.decode("ascii") not in packed
    assert not any(m.get("role") == "tool" for m in last)


def test_no_chats_resource_on_watch_paths(client) -> None:
    created = client.post(
        f"/v1/chats/{SEED}/messages",
        headers=AUTH,
        json={"content": "hi"},
    )
    assert created.status_code == 404
    missing = client.get(f"/v1/chats/{SEED}", headers=AUTH)
    assert missing.status_code == 404


def test_widget_row_attachments_empty(client) -> None:
    import json

    ask = {
        "prompt": "Pick one?",
        "options": [{"label": "A", "value": "A"}, {"label": "B", "value": "B"}],
    }
    status, _events = _send(
        client, SEED, f"SNORLAX_TOOL ask_user_question {json.dumps(ask)}"
    )
    assert status == 200
    listed = _msgs(client, SEED)
    widgets = [m for m in listed if m.get("kind") == "widget"]
    assert widgets
    assert widgets[0]["attachments"] == []


def test_agent_sent_one_to_one_isolation(client) -> None:
    other = client.post("/v1/agents", headers=AUTH, json={"name": "B"}).json()
    status, _events = _send(
        client, SEED, "Write a file named secret.txt containing only-a"
    )
    assert status == 200
    a_msgs = _msgs(client, SEED)
    b_msgs = _msgs(client, other["id"])
    a_assist = [
        m
        for m in a_msgs
        if m["role"] == "assistant" and m.get("kind", "message") == "message"
    ]
    assert a_assist[-1]["attachments"][0]["name"] == "secret.txt"
    assert all(not m.get("attachments") for m in b_msgs)
    assert all(m.get("senderId") != SEED for m in b_msgs if m.get("role") == "assistant")


def test_channel_agent_sent_attachments(client) -> None:
    inbox = client.post("/v1/agents", headers=AUTH, json={"name": "Inbox"}).json()
    status, _events = _send(
        client,
        CHANNEL,
        "@Inbox Write a file named room.txt containing shared",
    )
    assert status == 200
    timeline = _msgs(client, CHANNEL)
    assert timeline
    assert timeline[0]["senderId"] == "user"
    assert timeline[0].get("kind", "message") == "message"
    assert not any(m.get("kind") == "tool" for m in timeline)
    thread = _msgs(client, CHANNEL, timeline[0]["id"])
    tools = [m for m in thread if m.get("kind") == "tool"]
    assert tools
    assert all(m.get("attachments") == [] for m in tools)
    speaking = [
        m
        for m in thread
        if m["senderId"] == inbox["id"] and m.get("kind", "message") == "message"
    ]
    assert speaking
    att = speaking[-1]["attachments"][0]
    assert att["name"] == "room.txt"
    assert att["kind"] == "file"
    assert att["url"] == f"/v1/attachments/{att['id']}"
    fetched = client.get(att["url"], headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.content == b"shared"
    seed_msgs = _msgs(client, SEED)
    assert all(not m.get("attachments") for m in seed_msgs)


def test_handoff_card_has_no_agent_attachments(client) -> None:
    alice = client.post("/v1/agents", headers=AUTH, json={"name": "Alice"}).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    status, _events = _send(
        client,
        alice["id"],
        "@Bob please Write a file named room.txt containing shared",
    )
    assert status == 200
    alice_msgs = _msgs(client, alice["id"])
    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    thread_id = user["handoff"]["threadId"]
    timeline = _msgs(client, CHANNEL)
    handoffs = [m for m in timeline if m.get("kind") == "handoff"]
    assert handoffs
    assert all(m.get("attachments") == [] for m in handoffs)
    assert not any(m.get("kind") == "tool" for m in timeline)
    thread = _msgs(client, CHANNEL, thread_id)
    bob_tools = [
        m for m in thread if m.get("kind") == "tool" and m["senderId"] == bob["id"]
    ]
    assert bob_tools
    assert all(m.get("attachments") == [] for m in bob_tools)
    speaking = [
        m
        for m in thread
        if m["senderId"] == bob["id"] and m.get("kind", "message") == "message"
    ]
    assert speaking
    att = speaking[-1]["attachments"][0]
    assert att["name"] == "room.txt"
    assert att["kind"] == "file"
    assert all(m.get("senderId") != bob["id"] for m in alice_msgs)
    assert all(
        all(a.get("id") != att["id"] for a in (m.get("attachments") or []))
        for m in alice_msgs
    )
