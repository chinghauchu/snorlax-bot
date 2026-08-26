# SPDX-License-Identifier: Apache-2.0
"""Runtime-owned built-in tools: files, shell, web. Never called by clients."""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator, Callable
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote_plus, unquote, urljoin, urlparse

import httpx

from snorlax_runtime import KIND_CHANNEL
from snorlax_runtime.db import new_id
from snorlax_runtime.inference import InferenceError, StreamPart, ToolCall
from snorlax_runtime.widgets import (
    ASK_USER_QUESTION,
    ASK_USER_QUESTION_DEFINITION,
    parse_widget_args,
)

MAX_TOOL_ROUNDS = 8
MAX_FILE_BYTES = 256_000
MAX_SHELL_BYTES = 32_000
MAX_FETCH_BYTES = 200_000
MAX_LIST_ENTRIES = 200
DEFAULT_SHELL_TIMEOUT = 30.0
MAX_SHELL_TIMEOUT = 60.0
SEARCH_RESULT_CAP = 8

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_USER_AGENT = (
    "Snorlax-Bot/0.9 (+https://github.com/chinghauchu/snorlax-bot)"
)
BINARY_POLICY = "binary / too large"
DEFAULT_SEARCH_PROVIDER = "duckduckgo"
DEFAULT_SEARCH_TEMPLATES = {
    "duckduckgo": "https://html.duckduckgo.com/html/?q={query}",
}
_BLOCKED_NET_BINS = (
    "curl",
    "wget",
    "http",
    "https",
    "nc",
    "ncat",
    "netcat",
    "ssh",
    "scp",
    "sftp",
    "ftp",
    "telnet",
)

# Injected in tests. Signature: async (url, **kwargs) -> (status, body, content_type)
HttpGet = Callable[..., Any]
http_get: HttpGet | None = None

# Persist a kind=tool Message. Signature: async (content, message_id) -> public Message
PersistTool = Callable[..., Any]

_search_provider = DEFAULT_SEARCH_PROVIDER
_search_url: str | None = None
_no_net_bin: Path | None = None


def configure_tools(
    *,
    search_provider: str = DEFAULT_SEARCH_PROVIDER,
    search_url: str | None = None,
) -> None:
    """Set search provider from env/config. Call at runtime startup."""
    global _search_provider, _search_url
    _search_provider = (search_provider or DEFAULT_SEARCH_PROVIDER).strip().lower()
    _search_url = (search_url or "").strip() or None


def search_request_url(query: str) -> str:
    template = _search_url or DEFAULT_SEARCH_TEMPLATES.get(
        _search_provider, DEFAULT_SEARCH_TEMPLATES[DEFAULT_SEARCH_PROVIDER]
    )
    encoded = quote_plus(query)
    if "{query}" in template:
        return template.replace("{query}", encoded)
    joiner = "&" if "?" in template else "?"
    return f"{template}{joiner}q={encoded}"


class PathJailError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class BinaryFileError(Exception):
    def __init__(self, message: str = BINARY_POLICY) -> None:
        super().__init__(message)
        self.message = message


def workspace_for(data_dir: Path, conversation: dict[str, Any], agent_id: str) -> Path:
    """Active workspace root for a turn.

    Always a sandbox under ``data_dir/workspaces/``, never a picker for a
    folder on the host Mac. Extra fields such as ``projectPath`` are ignored.

    1:1 → ``workspaces/agents/{agentId}/``.
    Channel / handoff → ``workspaces/channels/{channelId}/`` only when that
    channel's ``sharedProject`` toggle is on (default off → speaking agent's
    workspace).
    """
    if conversation.get("kind") == KIND_CHANNEL and _shared_project_on(
        conversation
    ):
        return _workspace_dir(data_dir, "channels", conversation["id"])
    return _workspace_dir(data_dir, "agents", agent_id)


def _shared_project_on(conversation: dict[str, Any]) -> bool:
    value = conversation.get("sharedProject")
    if value is None:
        value = conversation.get("shared_project")
    return bool(value)


def _workspace_dir(data_dir: Path, kind: str, raw_id: str) -> Path:
    if not _SAFE_ID.match(raw_id or ""):
        raise PathJailError("invalid workspace id")
    return (data_dir / "workspaces" / kind / raw_id).resolve()


def drop_workspace(data_dir: Path, kind: str, raw_id: str) -> None:
    """Remove a workspace dir. Missing dirs are fine. Never recreates."""
    import shutil

    if kind not in {"agents", "channels"}:
        return
    if not _SAFE_ID.match(raw_id or ""):
        return
    shutil.rmtree(data_dir / "workspaces" / kind / raw_id, ignore_errors=True)


def ensure_workspace(root: Path) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    return root.resolve()


def resolve_in_workspace(root: Path, user_path: str | None) -> Path:
    """Resolve a user-supplied path inside root. Rejects traversal and abs escapes."""
    base = root.resolve()
    raw = (user_path or ".").strip() or "."
    if "\x00" in raw:
        raise PathJailError("invalid path")
    candidate = Path(raw)
    if candidate.is_absolute():
        resolved = candidate.resolve()
    else:
        resolved = (base / candidate).resolve()
    try:
        resolved.relative_to(base)
    except ValueError as exc:
        raise PathJailError("path escapes workspace") from exc
    return resolved


def pane_workspace(data_dir: Path, conversation: dict[str, Any]) -> Path:
    """Workspace the computer pane shows for this conversation.

    Same roots as ``workspace_for()``. Channel + ``sharedProject`` on →
    ``workspaces/channels/{channelId}/``. Channel + off → first member
    agent's workspace (speaking/selected is unclear on a GET). 1:1 →
    that agent's workspace. Never a Mac folder picker.
    """
    if conversation.get("kind") == KIND_CHANNEL and _shared_project_on(
        conversation
    ):
        return _workspace_dir(data_dir, "channels", conversation["id"])
    if conversation.get("kind") == KIND_CHANNEL:
        members = list(
            conversation.get("memberIds") or conversation.get("member_ids") or []
        )
        if members:
            return _workspace_dir(data_dir, "agents", members[0])
        return _workspace_dir(data_dir, "channels", conversation["id"])
    return _workspace_dir(data_dir, "agents", conversation["id"])


def workspace_root_label(data_dir: Path, root: Path) -> str:
    """Sandbox-relative root such as ``workspaces/agents/{id}``. Not a Mac path."""
    base = data_dir.resolve()
    try:
        return str(root.resolve().relative_to(base)).replace("\\", "/")
    except ValueError:
        return "workspaces"


def _rel_display(root: Path, target: Path) -> str:
    base = root.resolve()
    resolved = target.resolve()
    if resolved == base:
        return "."
    return str(resolved.relative_to(base)).replace("\\", "/")


def list_workspace(
    data_dir: Path, conversation: dict[str, Any], user_path: str | None
) -> dict[str, Any]:
    """List a directory inside the pane workspace. Empty root is ``[]``."""
    root = pane_workspace(data_dir, conversation)
    label = workspace_root_label(data_dir, root)
    target = resolve_in_workspace(root, user_path)
    rel = _rel_display(root, target)
    if not target.exists():
        if rel == ".":
            return {"root": label, "path": ".", "entries": []}
        raise FileNotFoundError(rel)
    if not target.is_dir():
        raise NotADirectoryError(rel)
    items = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    entries: list[dict[str, Any]] = []
    for item in items[:MAX_LIST_ENTRIES]:
        if item.is_dir():
            entries.append({"name": item.name, "kind": "dir"})
        else:
            try:
                size = item.stat().st_size
            except OSError:
                size = 0
            entries.append({"name": item.name, "kind": "file", "size": size})
    return {"root": label, "path": rel, "entries": entries}


def read_workspace_file(
    data_dir: Path, conversation: dict[str, Any], user_path: str | None
) -> dict[str, Any]:
    """Read a UTF-8 text file from the pane workspace.

    Missing → FileNotFoundError. Escape → PathJailError. Binary →
    BinaryFileError. Oversized text is truncated at ``MAX_FILE_BYTES``.
    """
    root = pane_workspace(data_dir, conversation)
    target = resolve_in_workspace(root, user_path)
    if not target.exists():
        raise FileNotFoundError(_rel_display(root, target))
    if target.is_dir():
        raise IsADirectoryError(_rel_display(root, target))
    data = target.read_bytes()
    if b"\x00" in data[:4096]:
        raise BinaryFileError()
    truncated = False
    if len(data) > MAX_FILE_BYTES:
        data = data[:MAX_FILE_BYTES]
        truncated = True
    return {
        "path": _rel_display(root, target),
        "content": data.decode("utf-8", "replace"),
        "truncated": truncated,
    }


TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_dir",
            "description": (
                "List files and directories inside the active workspace. "
                "Path is relative to the workspace root (default '.')."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Directory path relative to the workspace root.",
                    }
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file from the active workspace.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path relative to the workspace root.",
                    }
                },
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": (
                "Write a UTF-8 text file inside the active workspace. "
                "Creates parent directories. Prefer this over dumping a whole "
                "program in the chat bubble. The runtime runs this immediately "
                "(no approval widget)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a file inside the active workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "shell",
            "description": (
                "Run a shell command with cwd set to the workspace root. "
                "HOME is the workspace, not the host home directory. "
                "No extra network — do not curl or wget; HTTP is web_search "
                "or web_fetch only. No Docker/SSH host secrets. Timeout in "
                "seconds. The runtime runs this immediately (no approval)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {"type": "string"},
                    "timeout": {"type": "number"},
                },
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_search",
            "description": (
                "Search the public web via the configured search provider. "
                "Returns titles, URLs, and snippets. No API key required. "
                "The runtime runs this immediately (no approval)."
            ),
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "web_fetch",
            "description": (
                "HTTP GET a URL and return text or markdown. Size-capped. "
                "http/https only. This is the HTTP path; do not use shell "
                "curl. The runtime runs this immediately (no approval)."
            ),
            "parameters": {
                "type": "object",
                "properties": {"url": {"type": "string"}},
                "required": ["url"],
            },
        },
    },
]


def start_summary(name: str, args: dict[str, Any]) -> str:
    if name == "web_search":
        return "Searching…"
    if name == "web_fetch":
        host = urlparse(str(args.get("url") or "")).hostname or "url"
        return f"Fetching {host}…"
    if name == "write_file":
        return f"Writing {Path(str(args.get('path') or 'file')).name}…"
    if name == "read_file":
        return f"Reading {Path(str(args.get('path') or 'file')).name}…"
    if name == "list_dir":
        return "Listing files…"
    if name == "delete_file":
        return f"Deleting {Path(str(args.get('path') or 'file')).name}…"
    if name == "shell":
        cmd = str(args.get("command") or "").strip().replace("\n", " ")
        if len(cmd) > 48:
            cmd = cmd[:45] + "…"
        return f"Running `{cmd}`…" if cmd else "Running command…"
    return f"Using {name}…"


def _tool_path(args: dict[str, Any]) -> str:
    raw = str(args.get("path") or "").strip() or "."
    return raw.replace("\\", "/")


def done_summary(name: str, args: dict[str, Any], ok: bool) -> str:
    if not ok:
        return f"{name} failed"
    if name == "write_file":
        return f"Wrote {_tool_path(args)}"
    if name == "read_file":
        return f"Read {_tool_path(args)}"
    if name == "list_dir":
        return f"Listed {_tool_path(args)}"
    if name == "delete_file":
        return f"Deleted {_tool_path(args)}"
    if name == "shell":
        cmd = str(args.get("command") or "").strip().split()[:1]
        label = cmd[0] if cmd else "command"
        return f"Ran {label}"
    if name == "web_search":
        q = str(args.get("query") or "").strip()
        return f"Searched {q}" if q else "Searched"
    if name == "web_fetch":
        return "Fetched page"
    return f"Used {name}"


def followup_after_tools(
    outcomes: list[tuple[str, bool, str]],
    *,
    error: str | None = None,
) -> str:
    """Normal assistant text when the model did not finish after tools.

    Failed tool results stay in the muted kind=tool line; this is the LEFT
    bubble so the turn does not end on that line alone.
    """
    failed = [(name, result) for name, ok, result in outcomes if not ok]
    names = list(dict.fromkeys(name for name, _, _ in outcomes))
    used = ", ".join(names) if names else "tools"
    parts: list[str] = []
    for name, result in failed:
        snippet = (result or "").strip().splitlines()[0][:240]
        if snippet.lower().startswith("error:"):
            snippet = snippet.split(":", 1)[1].strip()
        parts.append(f"{name} failed" + (f": {snippet}" if snippet else ""))
    if error:
        parts.append(f"Inference failed after {used}: {error}")
    if parts:
        return "\n".join(parts)
    return f"I used {used} but had nothing more to add."


def offered_tool_definitions(*, use_tools: bool = True, use_widget: bool = True) -> list[dict[str, Any]]:
    """Built-ins first, then the question card, then namespaced MCP tools.

    Built-in names and ask_user_question win on collision. Widgets are not
    an approval gate for the other tools.
    """
    from snorlax_runtime.mcp import mcp_openai_tools

    tools: list[dict[str, Any]] = []
    if use_tools:
        tools.extend(TOOL_DEFINITIONS)
    if use_widget:
        tools.append(ASK_USER_QUESTION_DEFINITION)
    if use_tools:
        tools.extend(mcp_openai_tools())
    return tools


async def execute_named_tool(name: str, arguments: str, workspace: Path) -> str:
    """Dispatch one tool. MCP stays on the runtime event loop (not the shell)."""
    from snorlax_runtime.mcp import call_mcp_tool, is_mcp_tool

    if is_mcp_tool(name):
        return await call_mcp_tool(name, arguments)
    return await asyncio.to_thread(execute_tool, name, arguments, workspace)


def execute_tool(name: str, arguments: str, workspace: Path) -> str:
    try:
        args = json.loads(arguments) if arguments.strip() else {}
    except json.JSONDecodeError:
        return "Error: arguments must be a JSON object"
    if not isinstance(args, dict):
        return "Error: arguments must be a JSON object"
    try:
        if name == "list_dir":
            return _list_dir(workspace, str(args.get("path") or "."))
        if name == "read_file":
            return _read_file(workspace, str(args.get("path") or ""))
        if name == "write_file":
            return _write_file(
                workspace, str(args.get("path") or ""), str(args.get("content") or "")
            )
        if name == "delete_file":
            return _delete_file(workspace, str(args.get("path") or ""))
        if name == "shell":
            timeout = args.get("timeout")
            return _shell_sync(
                workspace,
                str(args.get("command") or ""),
                float(timeout) if timeout is not None else DEFAULT_SHELL_TIMEOUT,
            )
        if name == "web_search":
            return _await(_web_search(str(args.get("query") or "")))
        if name == "web_fetch":
            return _await(_web_fetch(str(args.get("url") or "")))
        return f"Error: unknown tool {name!r}"
    except PathJailError as exc:
        return f"Error: {exc.message}"
    except Exception as exc:  # noqa: BLE001 — tool errors are returned to the model
        return f"Error: {exc}"


def _await(coro: Any) -> Any:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is None or not loop.is_running():
        return asyncio.run(coro)
    # Called from an async tool loop: run on a helper loop in a thread.
    import concurrent.futures

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


def _list_dir(workspace: Path, path: str) -> str:
    target = resolve_in_workspace(workspace, path)
    if not target.exists():
        return f"Error: {path or '.'} does not exist"
    if not target.is_dir():
        return f"Error: {path or '.'} is not a directory"
    entries = sorted(target.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower()))
    lines: list[str] = []
    for item in entries[:MAX_LIST_ENTRIES]:
        kind = "dir" if item.is_dir() else "file"
        size = "" if item.is_dir() else f" {item.stat().st_size}"
        suffix = "/" if item.is_dir() else ""
        lines.append(f"{item.name}{suffix}  {kind}{size}")
    extra = ""
    if len(entries) > MAX_LIST_ENTRIES:
        extra = f"\n… {len(entries) - MAX_LIST_ENTRIES} more"
    return ("\n".join(lines) if lines else "(empty)") + extra


def _read_file(workspace: Path, path: str) -> str:
    if not path:
        return "Error: path is required"
    target = resolve_in_workspace(workspace, path)
    if not target.exists() or not target.is_file():
        return f"Error: {path} not found"
    data = target.read_bytes()
    if len(data) > MAX_FILE_BYTES:
        return f"Error: file larger than {MAX_FILE_BYTES} bytes"
    if b"\x00" in data[:4096]:
        return "Error: binary file"
    return data.decode("utf-8", "replace")


def _write_file(workspace: Path, path: str, content: str) -> str:
    if not path:
        return "Error: path is required"
    encoded = content.encode("utf-8")
    if len(encoded) > MAX_FILE_BYTES:
        return f"Error: content larger than {MAX_FILE_BYTES} bytes"
    target = resolve_in_workspace(workspace, path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(encoded)
    return f"Wrote {path} ({len(encoded)} bytes)"


def _delete_file(workspace: Path, path: str) -> str:
    if not path:
        return "Error: path is required"
    target = resolve_in_workspace(workspace, path)
    if not target.exists():
        return f"Error: {path} not found"
    if target.is_dir():
        return "Error: will not delete a directory"
    target.unlink()
    return f"Deleted {path}"


def _shell_env(workspace: Path) -> dict[str, str]:
    tmp = workspace / ".tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    path = os.environ.get("PATH", "/usr/bin:/bin:/usr/local/bin")
    lang = os.environ.get("LANG") or os.environ.get("LC_ALL") or "C.UTF-8"
    no_net = str(_no_net_bin_dir())
    dead = "http://127.0.0.1:9"
    return {
        "HOME": str(workspace),
        "TMPDIR": str(tmp),
        "TMP": str(tmp),
        "TEMP": str(tmp),
        "PATH": f"{no_net}:{path}",
        "LANG": lang,
        "LC_ALL": lang,
        "TERM": "dumb",
        # Shell has no extra network. HTTP is web_search / web_fetch only.
        "http_proxy": dead,
        "https_proxy": dead,
        "HTTP_PROXY": dead,
        "HTTPS_PROXY": dead,
        "ALL_PROXY": dead,
        "all_proxy": dead,
        "FTP_PROXY": dead,
    }


def _no_net_bin_dir() -> Path:
    global _no_net_bin
    if _no_net_bin is not None:
        return _no_net_bin
    import tempfile

    d = Path(tempfile.mkdtemp(prefix="snorlax-no-net-"))
    script = (
        "#!/bin/sh\n"
        'echo "Error: shell has no network. Use web_search or web_fetch." >&2\n'
        "exit 1\n"
    )
    for name in _BLOCKED_NET_BINS:
        path = d / name
        path.write_text(script, encoding="utf-8")
        path.chmod(0o755)
    _no_net_bin = d
    return d


def _netns_prefix() -> tuple[str, ...]:
    """Optional kernel netns. Unavailable in many containers; stubs still apply."""
    import shutil
    import subprocess

    unshare = shutil.which("unshare")
    if not unshare:
        return ()
    try:
        probe = subprocess.run(
            [unshare, "--net", "true"],
            capture_output=True,
            timeout=2,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ()
    if probe.returncode != 0:
        return ()
    return (unshare, "--net")


def _shell_sync(workspace: Path, command: str, timeout: float) -> str:
    if not command.strip():
        return "Error: command is required"
    timeout = min(max(timeout, 0.1), MAX_SHELL_TIMEOUT)
    env = _shell_env(workspace)
    argv = [*_netns_prefix(), "/bin/sh", "-c", command]
    try:
        import subprocess

        completed = subprocess.run(
            argv,
            shell=False,
            cwd=str(workspace),
            env=env,
            capture_output=True,
            timeout=timeout,
            text=True,
        )
    except subprocess.TimeoutExpired:
        return f"Error: shell timed out after {timeout}s"
    out = (completed.stdout or "") + (completed.stderr or "")
    if len(out.encode("utf-8", "replace")) > MAX_SHELL_BYTES:
        out = out.encode("utf-8", "replace")[:MAX_SHELL_BYTES].decode("utf-8", "replace")
        out += "\n… (truncated)"
    status = f"exit {completed.returncode}"
    return f"{status}\n{out}".rstrip()


async def _web_search(query: str) -> str:
    q = query.strip()
    if not q:
        return "Error: query is required"
    url = search_request_url(q)
    status, body, _ctype = await _http_get(url)
    if status >= 400:
        return f"Error: search returned HTTP {status}"
    results = _parse_search_html(body)
    if not results:
        return "No results."
    lines = []
    for i, item in enumerate(results[:SEARCH_RESULT_CAP], start=1):
        lines.append(f"{i}. {item['title']}\n   {item['url']}\n   {item['snippet']}")
    return "\n".join(lines)


async def _web_fetch(url: str) -> str:
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return "Error: url must be http or https"
    status, body, ctype = await _http_get(raw, max_bytes=MAX_FETCH_BYTES)
    if status >= 400:
        return f"Error: fetch returned HTTP {status}"
    if "html" in (ctype or "").lower() or body.lstrip()[:32].lower().startswith(
        ("<!doctype html", "<html")
    ):
        return _html_to_text(body, base=raw)
    return body


async def _http_get(
    url: str, *, max_bytes: int = MAX_FETCH_BYTES, timeout: float = 20.0
) -> tuple[int, str, str]:
    getter = http_get
    if getter is not None:
        result = getter(url, max_bytes=max_bytes, timeout=timeout)
        if asyncio.iscoroutine(result):
            result = await result
        status, body, ctype = result
        return int(status), str(body), str(ctype or "")
    headers = {"User-Agent": _USER_AGENT, "Accept": "text/html,text/plain,*/*"}
    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
        async with client.stream("GET", url, headers=headers) as response:
            chunks: list[bytes] = []
            total = 0
            async for chunk in response.aiter_bytes():
                total += len(chunk)
                if total > max_bytes:
                    chunks.append(chunk[: max(0, max_bytes - (total - len(chunk)))])
                    break
                chunks.append(chunk)
            body = b"".join(chunks).decode("utf-8", "replace")
            ctype = response.headers.get("content-type", "")
            return response.status_code, body, ctype


def _parse_search_html(html: str) -> list[dict[str, str]]:
    if _search_provider == "duckduckgo":
        return _parse_ddg(html) or _parse_generic_links(html)
    return _parse_generic_links(html) or _parse_ddg(html)


def _parse_generic_links(html: str) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    seen: set[str] = set()
    for match in re.finditer(
        r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        href = html_unescape(match.group(1)).strip()
        title = html_unescape(re.sub(r"<[^>]+>", "", match.group(2)))
        title = re.sub(r"\s+", " ", title).strip()
        if not href or not title or href in seen:
            continue
        seen.add(href)
        results.append({"title": title, "url": href, "snippet": ""})
    return results


def _parse_ddg(html: str) -> list[dict[str, str]]:
    results: list[dict[str, str]] = []
    for match in re.finditer(
        r'<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>',
        html,
        re.I | re.S,
    ):
        href = _unwrap_ddg(html_unescape(match.group(1)))
        title = re.sub(r"<[^>]+>", "", match.group(2))
        title = html_unescape(re.sub(r"\s+", " ", title)).strip()
        if not href or not title:
            continue
        results.append({"title": title, "url": href, "snippet": ""})
    snippets = re.findall(
        r'class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</(?:a|td|div|span)>',
        html,
        re.I | re.S,
    )
    for i, raw in enumerate(snippets):
        if i >= len(results):
            break
        text = html_unescape(re.sub(r"<[^>]+>", "", raw))
        results[i]["snippet"] = re.sub(r"\s+", " ", text).strip()[:240]
    return results


def _unwrap_ddg(href: str) -> str:
    parsed = urlparse(href)
    qs = parse_qs(parsed.query)
    if "uddg" in qs and qs["uddg"]:
        return unquote(qs["uddg"][0])
    if href.startswith("//"):
        return "https:" + href
    return href


def html_unescape(text: str) -> str:
    import html as html_lib

    return html_lib.unescape(text)


class _TextExtractor(HTMLParser):
    _SKIP = {"script", "style", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip = 0
        self._href: str | None = None
        self.links: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in self._SKIP:
            self._skip += 1
            return
        if self._skip:
            return
        if tag in {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "hr"}:
            self._chunks.append("\n")
        if tag == "a":
            href = dict(attrs).get("href")
            self._href = href

    def handle_endtag(self, tag: str) -> None:
        if tag in self._SKIP and self._skip:
            self._skip -= 1
        if tag == "a":
            self._href = None

    def handle_data(self, data: str) -> None:
        if self._skip:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if not text:
            return
        if self._href:
            self.links.append((text, self._href))
            self._chunks.append(f"[{text}]")
        else:
            self._chunks.append(text)

    def text(self) -> str:
        raw = " ".join(self._chunks)
        return re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", raw)).strip()


def _html_to_text(html: str, *, base: str = "") -> str:
    parser = _TextExtractor()
    try:
        parser.feed(html)
        parser.close()
    except Exception:  # noqa: BLE001
        return re.sub(r"<[^>]+>", " ", html)[:MAX_FETCH_BYTES]
    body = parser.text()
    extras: list[str] = []
    seen: set[str] = set()
    for label, href in parser.links[:20]:
        abs_url = urljoin(base, href)
        if abs_url in seen:
            continue
        seen.add(abs_url)
        extras.append(f"- {label}: {abs_url}")
    if extras:
        body = body + "\n\nLinks:\n" + "\n".join(extras)
    if len(body) > MAX_FETCH_BYTES:
        body = body[:MAX_FETCH_BYTES] + "\n… (truncated)"
    return body or "(empty)"


async def run_tool_loop(
    backend: Any,
    messages: list[dict[str, Any]],
    *,
    workspace: Path,
    agent: dict[str, Any],
    assistant_id: str,
    stream: bool,
    max_rounds: int = MAX_TOOL_ROUNDS,
    persist_tool: PersistTool | None = None,
    use_tools: bool = True,
    use_widget: bool = True,
) -> tuple[list[tuple[str, dict[str, Any]]], str, dict[str, Any] | None]:
    """Execute OpenAI-compat tool rounds. Yields SSE-shaped (event, payload) list.

    Clients never see the raw tools payload. Final assistant text is returned
    for persistence as a normal Message. A valid ask_user_question ends the
    turn immediately (no more tokens/tools) and returns the widget payload.

    A failed tool does not end the turn: results go back as role=tool and
    the model may call tools again until max_rounds. After any tool round,
    this always returns non-empty final text so the caller can persist a
    normal assistant bubble (empty model text and InferenceError after
    tools included), unless a question card ended the turn. InferenceError
    before any tool still propagates.
    """
    events: list[tuple[str, dict[str, Any]]] = []
    history: list[dict[str, Any]] = [dict(m) for m in messages]
    sender = {
        "id": assistant_id,
        "role": "assistant",
        "senderId": agent["id"],
        "senderName": agent["name"],
        "senderAvatar": agent.get("avatar"),
    }
    rounds = 0
    final_parts: list[str] = []
    tool_outcomes: list[tuple[str, bool, str]] = []
    widget: dict[str, Any] | None = None
    offered = offered_tool_definitions(use_tools=use_tools, use_widget=use_widget)

    while True:
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        try:
            async for part in _generate_parts(
                backend, history, tools=offered if offered else None
            ):
                if part.text:
                    text_parts.append(part.text)
                if offered and part.tool_calls:
                    tool_calls.extend(part.tool_calls)
        except InferenceError as exc:
            if rounds == 0:
                raise
            final_parts = [
                followup_after_tools(tool_outcomes, error=exc.message)
            ]
            break

        widget_calls = [c for c in tool_calls if c.name == ASK_USER_QUESTION]
        other_calls = [c for c in tool_calls if c.name != ASK_USER_QUESTION]
        if not use_tools:
            other_calls = []
        if not use_widget:
            widget_calls = []

        runnable = other_calls if other_calls and rounds < max_rounds else []
        pending_widget = None
        if widget_calls:
            pending_widget = parse_widget_args(widget_calls[0].arguments)

        if runnable:
            rounds += 1
            ensure_workspace(workspace)
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(text_parts) or None,
                "tool_calls": [_tool_call_payload(c) for c in runnable],
            }
            history.append(assistant_msg)
            for call in runnable:
                args = _parse_args(call.arguments)
                tool_id = new_id("msg") if persist_tool is not None else call.id
                if stream:
                    events.append(
                        (
                            "tool.start",
                            {
                                "id": tool_id,
                                "name": call.name,
                                "summary": start_summary(call.name, args),
                                "senderId": agent["id"],
                                "senderName": agent["name"],
                            },
                        )
                    )
                result = await execute_named_tool(
                    call.name, call.arguments, workspace
                )
                ok = not result.startswith("Error:")
                summary = done_summary(call.name, args, ok)
                tool_outcomes.append((call.name, ok, result))
                saved_tool: dict[str, Any] | None = None
                if persist_tool is not None:
                    persisted = persist_tool(summary, tool_id)
                    saved_tool = (
                        await persisted
                        if asyncio.iscoroutine(persisted)
                        else persisted
                    )
                if stream:
                    events.append(
                        (
                            "tool.done",
                            {
                                "id": tool_id,
                                "name": call.name,
                                "summary": summary,
                                "ok": ok,
                                "senderId": agent["id"],
                                "senderName": agent["name"],
                            },
                        )
                    )
                    if saved_tool:
                        events.append(("message.done", saved_tool))
                history.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.name,
                        "content": result,
                    }
                )
            if pending_widget is not None:
                widget = pending_widget
                final_parts = text_parts
                break
            continue

        if pending_widget is not None:
            widget = pending_widget
            final_parts = text_parts
            break

        if widget_calls and pending_widget is None:
            rounds += 1
            history.append(
                {
                    "role": "assistant",
                    "content": "".join(text_parts) or None,
                    "tool_calls": [_tool_call_payload(c) for c in widget_calls],
                }
            )
            history.append(
                {
                    "role": "tool",
                    "tool_call_id": widget_calls[0].id,
                    "name": ASK_USER_QUESTION,
                    "content": (
                        "Error: ask_user_question needs a natural-language "
                        "prompt and 1-6 options (label, optional value)."
                    ),
                }
            )
            if rounds >= max_rounds:
                final_parts = text_parts or [
                    "Stopped after the tool-round cap. Summarize with what you have."
                ]
                break
            continue

        if other_calls and rounds >= max_rounds:
            final_parts = text_parts or [
                "Stopped after the tool-round cap. Summarize with what you have."
            ]
        else:
            final_parts = text_parts
            if rounds > 0 and not "".join(final_parts).strip():
                final_parts = [followup_after_tools(tool_outcomes)]
        break

    content = "".join(final_parts)
    if widget is not None:
        # The card is not a fake-token stream. Preamble text (if any) still
        # streams as a normal LEFT bubble before the card.
        if stream and content:
            from snorlax_runtime.inference import _tokenize

            for token in _tokenize(content):
                events.append(("message.delta", {**sender, "delta": token}))
        return events, content, widget
    if stream and content:
        from snorlax_runtime.inference import _tokenize

        for token in _tokenize(content):
            events.append(
                (
                    "message.delta",
                    {
                        **sender,
                        "delta": token,
                    },
                )
            )
    elif stream:
        pass
    return events, content, None


def _parse_args(raw: str) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw.strip() else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _tool_call_payload(call: ToolCall) -> dict[str, Any]:
    return {
        "id": call.id,
        "type": "function",
        "function": {"name": call.name, "arguments": call.arguments},
    }


async def _generate_parts(
    backend: Any,
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None = None,
) -> AsyncIterator[StreamPart]:
    generate = getattr(backend, "generate", None)
    if generate is not None:
        kwargs: dict[str, Any] = {}
        if tools:
            kwargs["tools"] = tools
        async for part in generate(messages, **kwargs):
            yield part
        return
    # Backends that only implement stream() (text).
    async for token in backend.stream(messages):
        if isinstance(token, StreamPart):
            yield token
        else:
            yield StreamPart(text=str(token))
