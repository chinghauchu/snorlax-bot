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
from urllib.parse import parse_qs, unquote, urlencode, urljoin, urlparse

import httpx

from snorlax_runtime import KIND_CHANNEL
from snorlax_runtime.inference import InferenceError, StreamPart, ToolCall

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
    "Snorlax-Bot/0.5 (+https://github.com/chinghauchu/snorlax-bot)"
)
DDG_HTML = "https://html.duckduckgo.com/html/"

# Injected in tests. Signature: async (url, **kwargs) -> (status, body, content_type)
HttpGet = Callable[..., Any]
http_get: HttpGet | None = None


class PathJailError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def workspace_for(data_dir: Path, conversation: dict[str, Any], agent_id: str) -> Path:
    """Active workspace root for a turn.

    1:1 → that agent's private dir. Channel / handoff thread → the channel
    project (created lazily on first tool use).
    """
    if conversation.get("kind") == KIND_CHANNEL:
        return _workspace_dir(data_dir, "channels", conversation["id"])
    return _workspace_dir(data_dir, "agents", agent_id)


def _workspace_dir(data_dir: Path, kind: str, raw_id: str) -> Path:
    if not _SAFE_ID.match(raw_id or ""):
        raise PathJailError("invalid workspace id")
    return (data_dir / "workspaces" / kind / raw_id).resolve()


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
                "program in the chat bubble."
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
                "No Docker/SSH host secrets are passed in. Timeout in seconds."
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
                "Search the public web (DuckDuckGo HTML). No API key. "
                "Returns titles, URLs, and snippets."
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
                "http/https only."
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


def done_summary(name: str, args: dict[str, Any], ok: bool) -> str:
    if not ok:
        return f"{name} failed"
    if name == "write_file":
        return f"Wrote {Path(str(args.get('path') or 'file')).name}"
    if name == "read_file":
        return f"Read {Path(str(args.get('path') or 'file')).name}"
    if name == "list_dir":
        return "Listed files"
    if name == "delete_file":
        return f"Deleted {Path(str(args.get('path') or 'file')).name}"
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
    return {
        "HOME": str(workspace),
        "TMPDIR": str(tmp),
        "TMP": str(tmp),
        "TEMP": str(tmp),
        "PATH": path,
        "LANG": lang,
        "LC_ALL": lang,
        "TERM": "dumb",
    }


def _shell_sync(workspace: Path, command: str, timeout: float) -> str:
    if not command.strip():
        return "Error: command is required"
    timeout = min(max(timeout, 0.1), MAX_SHELL_TIMEOUT)
    env = _shell_env(workspace)
    try:
        import subprocess

        completed = subprocess.run(
            command,
            shell=True,
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
    url = f"{DDG_HTML}?{urlencode({'q': q})}"
    status, body, _ctype = await _http_get(url)
    if status >= 400:
        return f"Error: search returned HTTP {status}"
    results = _parse_ddg(body)
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
) -> tuple[list[tuple[str, dict[str, Any]]], str]:
    """Execute OpenAI-compat tool rounds. Yields SSE-shaped (event, payload) list.

    Clients never see the raw tools payload. Final assistant text is returned
    for persistence as a normal Message.
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

    while True:
        text_parts: list[str] = []
        tool_calls: list[ToolCall] = []
        try:
            async for part in _generate_parts(backend, history):
                if part.text:
                    text_parts.append(part.text)
                if part.tool_calls:
                    tool_calls.extend(part.tool_calls)
        except InferenceError:
            raise

        if tool_calls and rounds < max_rounds:
            rounds += 1
            ensure_workspace(workspace)
            assistant_msg: dict[str, Any] = {
                "role": "assistant",
                "content": "".join(text_parts) or None,
                "tool_calls": [_tool_call_payload(c) for c in tool_calls],
            }
            history.append(assistant_msg)
            for call in tool_calls:
                args = _parse_args(call.arguments)
                if stream:
                    events.append(
                        (
                            "tool.start",
                            {
                                "id": call.id,
                                "name": call.name,
                                "summary": start_summary(call.name, args),
                                "senderId": agent["id"],
                                "senderName": agent["name"],
                            },
                        )
                    )
                result = await asyncio.to_thread(
                    execute_tool, call.name, call.arguments, workspace
                )
                ok = not result.startswith("Error:")
                if stream:
                    events.append(
                        (
                            "tool.done",
                            {
                                "id": call.id,
                                "name": call.name,
                                "summary": done_summary(call.name, args, ok),
                                "ok": ok,
                                "senderId": agent["id"],
                                "senderName": agent["name"],
                            },
                        )
                    )
                history.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "name": call.name,
                        "content": result,
                    }
                )
            continue

        if tool_calls and rounds >= max_rounds:
            final_parts = text_parts or [
                "Stopped after the tool-round cap. Summarize with what you have."
            ]
        else:
            final_parts = text_parts
        break

    content = "".join(final_parts)
    if stream and content:
        # Tokenize the same way mock replies do so existing SSE tests stay happy
        # when this path is a normal (no-tool) turn.
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
        # Empty content still allowed; caller persists it.
        pass
    return events, content


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


async def _generate_parts(backend: Any, messages: list[dict[str, Any]]) -> AsyncIterator[StreamPart]:
    generate = getattr(backend, "generate", None)
    if generate is not None:
        async for part in generate(messages, tools=TOOL_DEFINITIONS):
            yield part
        return
    # Backends that only implement stream() (text).
    async for token in backend.stream(messages):
        if isinstance(token, StreamPart):
            yield token
        else:
            yield StreamPart(text=str(token))
