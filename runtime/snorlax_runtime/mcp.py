# SPDX-License-Identifier: Apache-2.0
"""Runtime MCP client. Desktop/iOS never speak MCP.

stdio subprocess servers and LAN HTTP (streamable HTTP or legacy SSE).
Config lives on disk as ``mcp.json`` under ``SNORLAX_DATA_DIR``.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import socket
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from mcp import ClientSession, StdioServerParameters, types
from mcp.client.sse import sse_client
from mcp.client.stdio import get_default_environment, stdio_client
from mcp.client.streamable_http import streamable_http_client

from snorlax_runtime import __version__

log = logging.getLogger("snorlax.mcp")

MCP_CONFIG_NAME = "mcp.json"
INIT_TIMEOUT = 20.0
CALL_TIMEOUT = 30.0
MAX_MCP_RESULT_CHARS = 32_000
SERVER_NAME_RE_MAX = 64

BUILTIN_TOOL_NAMES = frozenset(
    {
        "list_dir",
        "read_file",
        "write_file",
        "delete_file",
        "shell",
        "web_search",
        "web_fetch",
        "ask_user_question",
    }
)

_METADATA_HOSTS = frozenset(
    {
        "metadata.google.internal",
        "metadata.goog",
        "instance-data",
    }
)
_LINK_LOCAL_V4 = ipaddress.ip_network("169.254.0.0/16")
_LINK_LOCAL_V6 = ipaddress.ip_network("fe80::/10")

_manager: McpManager | None = None


def get_mcp_manager() -> McpManager | None:
    return _manager


def set_mcp_manager(manager: McpManager | None) -> None:
    global _manager
    _manager = manager


def mcp_config_path(data_dir: Path) -> Path:
    return data_dir / MCP_CONFIG_NAME


def qualify_tool_name(server: str, tool: str) -> str:
    return f"{server}__{tool}"


def load_mcp_config(data_dir: Path) -> dict[str, Any]:
    """Load mcp.json. Missing, empty, or invalid → no servers."""
    path = mcp_config_path(data_dir)
    if not path.is_file():
        return {}
    try:
        raw = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        log.warning("mcp.json unreadable: %s", exc)
        return {}
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        log.warning("mcp.json is not valid JSON: %s", exc)
        return {}
    if not isinstance(parsed, dict):
        log.warning("mcp.json must be a JSON object")
        return {}
    return parsed


def mcp_servers_from_config(config: dict[str, Any]) -> dict[str, dict[str, Any]]:
    raw = config.get("mcpServers")
    if not isinstance(raw, dict):
        return {}
    out: dict[str, dict[str, Any]] = {}
    for key, spec in raw.items():
        name = _sanitize_server_name(str(key))
        if not name:
            log.warning("skipping MCP server with invalid name %r", key)
            continue
        if not isinstance(spec, dict):
            log.warning("mcp server %s: spec must be an object", name)
            continue
        out[name] = spec
    return out


def _sanitize_server_name(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return ""
    cleaned: list[str] = []
    for ch in text:
        if ch.isalnum() or ch in {"_", "-"}:
            cleaned.append(ch)
        else:
            cleaned.append("_")
    name = "".join(cleaned).strip("_-")
    if not name or not name[0].isalpha():
        return ""
    return name[:SERVER_NAME_RE_MAX]


def mcp_url_allowed(url: str) -> tuple[bool, str]:
    """Allow loopback, RFC1918, .local, and other user-configured hosts.

    Reject non-http(s) and obvious SSRF to link-local metadata
    (169.254.169.254 / 169.254.0.0/16 / fe80::/10).
    """
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        return False, "url must be http or https"
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return False, "url missing host"
    if host in _METADATA_HOSTS:
        return False, "blocked metadata host"
    if host.endswith(".local"):
        return True, ""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        ip = None
    if ip is not None:
        if _is_blocked_ip(ip):
            return False, "blocked link-local metadata"
        return True, ""
    try:
        infos = socket.getaddrinfo(host, parsed.port or 80, type=socket.SOCK_STREAM)
    except socket.gaierror:
        # User-configured hostname that does not resolve yet — still allow
        # (LAN .local already returned). Do not require a public hostname.
        return True, ""
    for info in infos:
        addr = info[4][0]
        try:
            resolved = ipaddress.ip_address(addr)
        except ValueError:
            continue
        if _is_blocked_ip(resolved):
            return False, "blocked link-local metadata"
    return True, ""


def _is_blocked_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if ip.version == 4 and ip in _LINK_LOCAL_V4:
        return True
    if ip.version == 6:
        mapped = getattr(ip, "ipv4_mapped", None)
        if mapped is not None and mapped in _LINK_LOCAL_V4:
            return True
        if ip in _LINK_LOCAL_V6:
            return True
    return False


def _httpx_factory(
    headers: dict[str, str] | None = None,
    timeout: httpx.Timeout | None = None,
    auth: httpx.Auth | None = None,
) -> httpx.AsyncClient:
    """MCP HTTP is the runtime's HTTP path (like web_fetch), not the agent shell.

    Redirects are off so a 169.254 hop cannot hide behind a LAN URL.
    """
    kwargs: dict[str, Any] = {
        "follow_redirects": False,
        "timeout": timeout
        or httpx.Timeout(30.0, read=300.0),
    }
    if headers is not None:
        kwargs["headers"] = headers
    if auth is not None:
        kwargs["auth"] = auth
    return httpx.AsyncClient(**kwargs)


def _transport_kind(spec: dict[str, Any]) -> str:
    raw = str(spec.get("transport") or "").strip().lower()
    url = str(spec.get("url") or "").strip()
    if raw in {"sse", "http+sse", "http-sse"}:
        return "sse"
    if raw in {"http", "streamable", "streamable-http", "streamable_http"}:
        return "http"
    if url:
        path = (urlparse(url).path or "").rstrip("/").lower()
        if path.endswith("/sse"):
            return "sse"
        return "http"
    return "stdio"


class McpServerConn:
    def __init__(
        self,
        name: str,
        session: ClientSession,
        stack: AsyncExitStack,
        tools: list[types.Tool],
    ) -> None:
        self.name = name
        self.session = session
        self.stack = stack
        self.tools = tools


class McpManager:
    def __init__(self) -> None:
        self.servers: dict[str, McpServerConn] = {}
        self.qualified: dict[str, tuple[str, str]] = {}
        self.definitions: list[dict[str, Any]] = []
        self.failures: list[str] = []

    async def start(self, data_dir: Path) -> None:
        config = load_mcp_config(data_dir)
        specs = mcp_servers_from_config(config)
        for name, spec in specs.items():
            try:
                await asyncio.wait_for(self._connect(name, spec), timeout=INIT_TIMEOUT + 5)
            except Exception as exc:  # noqa: BLE001 — boot must continue
                msg = f"{name}: {exc}"
                self.failures.append(msg)
                log.warning("MCP server %s failed to start: %s", name, exc)
                print(f"  mcp {name} failed: {exc}", flush=True)

    async def _connect(self, name: str, spec: dict[str, Any]) -> None:
        kind = _transport_kind(spec)
        stack = AsyncExitStack()
        await stack.__aenter__()
        try:
            if kind in {"http", "sse"}:
                url = str(spec.get("url") or "").strip()
                if not url:
                    raise ValueError("url is required")
                ok, reason = mcp_url_allowed(url)
                if not ok:
                    raise ValueError(reason)
                headers = _optional_headers(spec.get("headers"))
                if kind == "sse":
                    read, write = await stack.enter_async_context(
                        sse_client(
                            url,
                            headers=headers,
                            httpx_client_factory=_httpx_factory,
                        )
                    )
                else:
                    http_client = await stack.enter_async_context(
                        _httpx_factory(headers=headers)
                    )
                    read, write, _sid = await stack.enter_async_context(
                        streamable_http_client(url, http_client=http_client)
                    )
            else:
                command = str(spec.get("command") or "").strip()
                if not command:
                    raise ValueError("command or url is required")
                args = spec.get("args") or []
                if not isinstance(args, list) or any(not isinstance(a, str) for a in args):
                    raise ValueError("args must be a list of strings")
                env = get_default_environment()
                extra = spec.get("env") or {}
                if not isinstance(extra, dict):
                    raise ValueError("env must be an object")
                for key, value in extra.items():
                    env[str(key)] = str(value)
                params = StdioServerParameters(
                    command=command,
                    args=list(args),
                    env=env,
                )
                read, write = await stack.enter_async_context(stdio_client(params))
            session = await stack.enter_async_context(
                ClientSession(
                    read,
                    write,
                    client_info=types.Implementation(
                        name="snorlax-bot",
                        version=__version__,
                    ),
                )
            )
            await asyncio.wait_for(session.initialize(), timeout=INIT_TIMEOUT)
            listed: list[types.Tool] = []
            cursor: str | None = None
            while True:
                page = await asyncio.wait_for(
                    session.list_tools(cursor=cursor), timeout=INIT_TIMEOUT
                )
                listed.extend(list(page.tools or []))
                cursor = getattr(page, "nextCursor", None) or getattr(
                    page, "next_cursor", None
                )
                if not cursor:
                    break
            conn = McpServerConn(name, session, stack, listed)
            self.servers[name] = conn
            for tool in listed:
                self._register_tool(name, tool)
        except BaseException:
            await stack.aclose()
            raise

    def _register_tool(self, server: str, tool: types.Tool) -> None:
        original = str(tool.name or "").strip()
        if not original:
            return
        qualified = qualify_tool_name(server, original)
        if original in BUILTIN_TOOL_NAMES:
            # Prefix still used; builtin bare name is never replaced.
            pass
        if qualified in BUILTIN_TOOL_NAMES:
            log.warning(
                "MCP tool %s collides with a built-in; skipping", qualified
            )
            return
        if qualified in self.qualified:
            log.warning("MCP tool %s already registered; skipping", qualified)
            return
        self.qualified[qualified] = (server, original)
        schema = tool.inputSchema if isinstance(tool.inputSchema, dict) else {}
        if not schema:
            schema = {"type": "object", "properties": {}}
        description = (tool.description or "").strip() or f"MCP tool {qualified}"
        self.definitions.append(
            {
                "type": "function",
                "function": {
                    "name": qualified,
                    "description": description,
                    "parameters": schema,
                },
            }
        )

    def has_tool(self, name: str) -> bool:
        return name in self.qualified

    def openai_tools(self) -> list[dict[str, Any]]:
        return list(self.definitions)

    def tool_names(self) -> list[str]:
        return list(self.qualified.keys())

    async def call_tool(self, qualified: str, arguments: str) -> str:
        mapping = self.qualified.get(qualified)
        if mapping is None:
            return f"Error: unknown tool {qualified!r}"
        server_name, original = mapping
        conn = self.servers.get(server_name)
        if conn is None:
            return f"Error: MCP server {server_name!r} is not connected"
        try:
            args = json.loads(arguments) if arguments.strip() else {}
        except json.JSONDecodeError:
            return "Error: arguments must be a JSON object"
        if not isinstance(args, dict):
            return "Error: arguments must be a JSON object"
        try:
            result = await asyncio.wait_for(
                conn.session.call_tool(original, args),
                timeout=CALL_TIMEOUT,
            )
        except Exception as exc:  # noqa: BLE001
            return f"Error: {exc}"
        text = _result_text(result)
        if getattr(result, "isError", False):
            if not text.lower().startswith("error:"):
                text = f"Error: {text or 'MCP tool failed'}"
            return text
        return text or "(empty)"

    async def close(self) -> None:
        for conn in list(self.servers.values()):
            try:
                await conn.stack.aclose()
            except Exception as exc:  # noqa: BLE001
                log.warning("MCP server %s close failed: %s", conn.name, exc)
        self.servers.clear()
        self.qualified.clear()
        self.definitions.clear()


def _optional_headers(raw: Any) -> dict[str, str] | None:
    if not isinstance(raw, dict) or not raw:
        return None
    return {str(k): str(v) for k, v in raw.items()}


def _result_text(result: Any) -> str:
    parts: list[str] = []
    for block in getattr(result, "content", None) or []:
        text = getattr(block, "text", None)
        if text:
            parts.append(str(text))
    if parts:
        body = "\n".join(parts)
    else:
        structured = getattr(result, "structuredContent", None) or getattr(
            result, "structured_content", None
        )
        body = json.dumps(structured) if structured else ""
    if len(body) > MAX_MCP_RESULT_CHARS:
        return body[:MAX_MCP_RESULT_CHARS] + "\n… (truncated)"
    return body


def is_mcp_tool(name: str) -> bool:
    manager = get_mcp_manager()
    return manager is not None and manager.has_tool(name)


def mcp_openai_tools() -> list[dict[str, Any]]:
    manager = get_mcp_manager()
    if manager is None:
        return []
    return manager.openai_tools()


def mcp_tool_names() -> list[str]:
    manager = get_mcp_manager()
    if manager is None:
        return []
    return manager.tool_names()


async def call_mcp_tool(name: str, arguments: str) -> str:
    manager = get_mcp_manager()
    if manager is None:
        return f"Error: unknown tool {name!r}"
    return await manager.call_tool(name, arguments)


async def start_mcp(data_dir: Path) -> McpManager:
    manager = McpManager()
    await manager.start(data_dir)
    set_mcp_manager(manager)
    return manager


async def stop_mcp(manager: McpManager | None) -> None:
    if manager is not None:
        await manager.close()
    if get_mcp_manager() is manager:
        set_mcp_manager(None)
