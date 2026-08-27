# SPDX-License-Identifier: Apache-2.0
"""Slack / GitHub inbound listeners via the connected MCP plugin.

No extra HTTP route. Cron XOR trigger still holds. Matching Slack
messages and GitHub PR events call ``fire_routine_now`` into that
agent's 1:1. Pause skips. Unknown / unconnected plugin is 422 on
create, not a silent no-op at POST time.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any
from urllib.parse import urlparse

from snorlax_runtime.mcp import plugin_kind_connected

log = logging.getLogger("snorlax.listeners")

GITHUB_PR_EVENTS = frozenset({"pr-opened", "pr-pushed", "pr-merged"})
_WILDCARD = re.compile(r"[*?\[\]]")
_REPO = re.compile(r"^[^/*?\[\s]+/[^/*?\[\s]+$")

_bound: dict[str, Any] = {}


def bind_runtime(
    *,
    store: Any,
    backend: Any,
    get_mcp: Any,
    max_tool_rounds: int | None = None,
) -> None:
    """Attach the running Store / backend so MCP notifications can fire."""
    _bound["store"] = store
    _bound["backend"] = backend
    _bound["get_mcp"] = get_mcp
    _bound["max_tool_rounds"] = max_tool_rounds


def unbind_runtime() -> None:
    _bound.clear()


def github_repo_valid(raw: str | None) -> bool:
    """Exactly ``owner/name``. No empty parts, no extra path, no wildcards."""
    text = (raw or "").strip()
    if not text or _WILDCARD.search(text):
        return False
    return bool(_REPO.fullmatch(text))


def slack_label(channel: str) -> str:
    return f"Slack {channel.strip()}"


def github_label(repo: str) -> str:
    return f"GitHub {repo.strip()}"


def normalize_channel(raw: str | None) -> str:
    return (raw or "").strip().lstrip("#").lower()


def normalize_repo(raw: str | None) -> str:
    return (raw or "").strip().strip("/").lower()


def _to_plain(message: Any) -> Any:
    if message is None or isinstance(message, BaseException):
        return None
    name = type(message).__name__
    if name == "RequestResponder":
        return None
    root = getattr(message, "root", None)
    if root is not None and root is not message:
        return _to_plain(root)
    dump = getattr(message, "model_dump", None)
    if callable(dump):
        try:
            return dump(mode="python")
        except TypeError:
            return dump()
    if isinstance(message, (dict, list, str, int, float, bool)):
        return message
    data = getattr(message, "data", None)
    if data is not None and data is not message:
        return _to_plain(data)
    return None


def _walk_dicts(value: Any, into: list[dict[str, Any]], *, depth: int = 0) -> None:
    if depth > 6:
        return
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("{") or text.startswith("["):
            try:
                value = json.loads(text)
            except json.JSONDecodeError:
                return
        else:
            return
    if isinstance(value, dict):
        into.append(value)
        for key in ("params", "data", "event", "payload", "body", "message"):
            if key in value:
                _walk_dicts(value.get(key), into, depth=depth + 1)
        return
    if isinstance(value, list):
        for item in value[:12]:
            _walk_dicts(item, into, depth=depth + 1)


def _channel_from(blob: dict[str, Any]) -> str | None:
    channel = blob.get("channel")
    if isinstance(channel, str) and channel.strip():
        return channel.strip()
    if isinstance(channel, dict):
        for key in ("name", "id", "name_normalized"):
            val = channel.get(key)
            if isinstance(val, str) and val.strip():
                return val.strip()
    for key in ("channel_name", "channel_id", "channelName", "channelId"):
        val = blob.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return None


def _repo_from(blob: dict[str, Any]) -> str | None:
    repo = blob.get("repo") or blob.get("repository")
    if isinstance(repo, str) and repo.strip():
        return repo.strip()
    if isinstance(repo, dict):
        full = repo.get("full_name") or repo.get("fullName")
        if isinstance(full, str) and full.strip():
            return full.strip()
        owner = repo.get("owner")
        name = repo.get("name")
        owner_login = (
            owner.get("login")
            if isinstance(owner, dict)
            else owner
            if isinstance(owner, str)
            else None
        )
        if isinstance(owner_login, str) and isinstance(name, str):
            joined = f"{owner_login.strip()}/{name.strip()}"
            if "/" in joined:
                return joined
    return None


def _github_event(blob: dict[str, Any]) -> str | None:
    explicit = str(
        blob.get("event") or blob.get("githubEvent") or blob.get("kind") or ""
    ).strip().lower()
    if explicit in GITHUB_PR_EVENTS:
        return explicit
    action = str(blob.get("action") or "").strip().lower()
    name = str(
        blob.get("event_name") or blob.get("x-github-event") or blob.get("type") or ""
    ).strip().lower()
    pr = blob.get("pull_request")
    if pr is None:
        pr = blob.get("pullRequest")
    looks_pr = (
        name in {"pull_request", "pullrequest", "github"}
        or pr is not None
        or explicit in {"pull_request", "github", "pr"}
    )
    if not looks_pr:
        return None
    if action == "opened" or explicit in {"opened", "pr_opened", "pull_request.opened"}:
        return "pr-opened"
    if action in {"synchronize", "synchronized"} or explicit in {
        "synchronize",
        "pr_pushed",
        "pull_request.synchronize",
    }:
        return "pr-pushed"
    if action == "closed":
        merged = bool(blob.get("merged"))
        if isinstance(pr, dict):
            merged = merged or bool(pr.get("merged"))
        if merged:
            return "pr-merged"
    return None


def _is_slack_message(blob: dict[str, Any], *, server: str) -> bool:
    kind = str(blob.get("kind") or blob.get("type") or "").strip().lower()
    subtype = str(blob.get("subtype") or "").strip().lower()
    if subtype in {
        "message_changed",
        "message_deleted",
        "channel_join",
        "channel_leave",
        "bot_add",
    }:
        return False
    if kind in {"slack", "message", "slack.message", "channel_message"}:
        return True
    if kind in {"event_callback", "event"}:
        return False
    if "slack" in server and _channel_from(blob) and kind in {"", "notification"}:
        return True
    return False


def _from_uri(uri: str) -> dict[str, Any] | None:
    parsed = urlparse(uri.strip())
    scheme = (parsed.scheme or "").lower()
    rest = "/".join(
        p for p in (parsed.netloc, parsed.path.lstrip("/")) if p
    )
    if "slack" in scheme:
        channel = parsed.fragment or rest.split("/")[-1] or rest
        if channel:
            return {"kind": "slack", "type": "message", "channel": channel}
    if "github" in scheme or scheme in {"gh"}:
        parts = [p for p in rest.split("/") if p]
        if len(parts) >= 2:
            repo = f"{parts[0]}/{parts[1]}"
            event = "pr-opened"
            joined = "/".join(parts).lower()
            if "merged" in joined or "close" in joined:
                event = "pr-merged"
            elif "push" in joined or "synchronize" in joined:
                event = "pr-pushed"
            return {"kind": "github", "repo": repo, "event": event}
    return None


def parse_plugin_event(server_name: str, message: Any) -> dict[str, Any] | None:
    """Turn an MCP notification / dict into a slack or github fire event."""
    server = (server_name or "").strip().lower()
    plain = _to_plain(message)
    blobs: list[dict[str, Any]] = []
    _walk_dicts(plain, blobs)
    if isinstance(plain, dict):
        uri = plain.get("uri") or (plain.get("params") or {}).get("uri")
        if isinstance(uri, str):
            parsed = _from_uri(uri)
            if parsed:
                return parsed
    for blob in blobs:
        kind = str(blob.get("kind") or blob.get("type") or "").strip().lower()
        if kind == "slack" or _is_slack_message(blob, server=server):
            channel = _channel_from(blob)
            if channel:
                return {"kind": "slack", "type": "message", "channel": channel}
        github_kind = _github_event(blob)
        repo = _repo_from(blob)
        if github_kind and repo:
            return {"kind": "github", "repo": repo, "event": github_kind}
        if kind == "github" and repo:
            event = github_kind or str(blob.get("event") or "").strip().lower()
            if event in GITHUB_PR_EVENTS:
                return {"kind": "github", "repo": repo, "event": event}
    if "slack" in server:
        for blob in blobs:
            channel = _channel_from(blob)
            if channel and _is_slack_message(blob, server=server):
                return {"kind": "slack", "type": "message", "channel": channel}
    if "github" in server:
        for blob in blobs:
            repo = _repo_from(blob)
            event = _github_event(blob)
            if repo and event:
                return {"kind": "github", "repo": repo, "event": event}
    return None


def _matches(row: dict[str, Any], event: dict[str, Any]) -> bool:
    kind = str(row.get("triggerType") or "").strip().lower()
    if kind != event.get("kind"):
        return False
    stored = str(row.get("schedule") or "").strip()
    if not stored:
        return False
    if kind == "slack":
        if str(event.get("type") or "message").lower() not in {
            "message",
            "slack",
            "slack.message",
        }:
            return False
        return normalize_channel(stored) == normalize_channel(
            str(event.get("channel") or "")
        )
    if kind == "github":
        if str(event.get("event") or "") not in GITHUB_PR_EVENTS:
            return False
        return normalize_repo(stored) == normalize_repo(str(event.get("repo") or ""))
    return False


async def fire_inbound_event(
    event: dict[str, Any] | None,
    *,
    store: Any | None = None,
    backend: Any | None = None,
    manager: Any | None = None,
    max_tool_rounds: int | None = None,
) -> list[dict[str, Any]]:
    """Fire matching enabled Slack/GitHub routines. Pause skips."""
    from snorlax_runtime.scheduler import fire_routine_now

    if not event or event.get("kind") not in {"slack", "github"}:
        return []
    store = store or _bound.get("store")
    backend = backend or _bound.get("backend")
    if manager is None:
        getter = _bound.get("get_mcp")
        manager = getter() if callable(getter) else getter
    rounds = (
        max_tool_rounds
        if max_tool_rounds is not None
        else _bound.get("max_tool_rounds")
    )
    if store is None or backend is None:
        return []
    kind = str(event.get("kind"))
    if not plugin_kind_connected(manager, kind):
        return []
    fired: list[dict[str, Any]] = []
    for row in await store.list_all_routines():
        if str(row.get("triggerType") or "") != kind:
            continue
        if not row.get("enabled"):
            continue
        if not _matches(row, event):
            continue
        try:
            await fire_routine_now(
                store,
                backend,
                row,
                max_tool_rounds=rounds,
            )
        except Exception:
            log.exception("inbound routine %s failed", row.get("id"))
            continue
        fired.append(row)
    return fired


async def handle_mcp_message(server_name: str, message: Any) -> None:
    event = parse_plugin_event(server_name, message)
    if event is None:
        return
    await fire_inbound_event(event)
