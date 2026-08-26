# SPDX-License-Identifier: Apache-2.0
"""Runtime MCP client. Desktop/iOS never speak MCP.

stdio subprocess servers and LAN HTTP (streamable HTTP or legacy SSE).
Config lives on disk as ``mcp.json`` under ``SNORLAX_DATA_DIR``. Chrome
lists and authenticates plugins through ``/v1/plugins``; clients never
read the host disk or speak MCP.
"""

from __future__ import annotations

import asyncio
import ipaddress
import json
import logging
import secrets
import socket
from contextlib import AsyncExitStack
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

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

STATUS_CONNECTED = "connected"
STATUS_NEEDS_AUTH = "needsAuth"
STATUS_ERROR = "error"
STATUS_DISCONNECTED = "disconnected"
TRANSPORT_STDIO = "stdio"
TRANSPORT_HTTP = "http"

BUILTIN_TOOL_NAMES = frozenset(
    {
        "list_dir",
        "read_file",
        "write_file",
        "delete_file",
        "shell",
        "web_search",
        "web_fetch",
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


class McpConfigError(Exception):
    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def get_mcp_manager() -> McpManager | None:
    return _manager


def set_mcp_manager(manager: McpManager | None) -> None:
    global _manager
    _manager = manager


def mcp_config_path(data_dir: Path) -> Path:
    return data_dir / MCP_CONFIG_NAME


def qualify_tool_name(server: str, tool: str) -> str:
    return f"{server}__{tool}"


def split_qualified(name: str) -> tuple[str, str] | None:
    if "__" not in (name or ""):
        return None
    server, tool = name.split("__", 1)
    if not server or not tool:
        return None
    return server, tool


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


def save_mcp_config(data_dir: Path, config: dict[str, Any]) -> None:
    path = mcp_config_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(config, indent=2, ensure_ascii=False) + "\n"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(path)


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


def public_transport(spec: dict[str, Any]) -> str:
    kind = _transport_kind(spec)
    return TRANSPORT_HTTP if kind in {"http", "sse"} else TRANSPORT_STDIO


def _is_disabled(spec: dict[str, Any]) -> bool:
    if spec.get("disabled") is True:
        return True
    if spec.get("enabled") is False:
        return True
    return False


def _is_auth_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    markers = (
        "401",
        "403",
        "unauthorized",
        "forbidden",
        "invalid_token",
        "invalid token",
        "needs auth",
        "authentication",
        "www-authenticate",
    )
    return any(marker in text for marker in markers)


def _optional_headers(raw: Any) -> dict[str, str] | None:
    if not isinstance(raw, dict) or not raw:
        return None
    return {str(k): str(v) for k, v in raw.items()}


def _tools_cache(listed: list[types.Tool]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for tool in listed:
        name = str(tool.name or "").strip()
        if not name:
            continue
        schema = tool.inputSchema if isinstance(tool.inputSchema, dict) else {}
        out.append(
            {
                "name": name,
                "description": (tool.description or "").strip(),
                "inputSchema": schema or {"type": "object", "properties": {}},
            }
        )
    return out


def _cached_tool_defs(raw: Any) -> list[dict[str, Any]]:
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        schema = item.get("inputSchema") if isinstance(item.get("inputSchema"), dict) else {}
        out.append(
            {
                "name": name,
                "description": str(item.get("description") or "").strip(),
                "inputSchema": schema or {"type": "object", "properties": {}},
            }
        )
    return out


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


class McpRecord:
    def __init__(self, name: str, spec: dict[str, Any]) -> None:
        self.name = name
        self.spec = spec
        self.status = STATUS_DISCONNECTED
        self.error: str | None = None
        self.cached_tools = _cached_tool_defs(spec.get("tools"))

    @property
    def display_name(self) -> str:
        raw = str(self.spec.get("name") or "").strip()
        return raw or self.name


class McpManager:
    def __init__(self) -> None:
        self.data_dir: Path | None = None
        self.servers: dict[str, McpServerConn] = {}
        self.qualified: dict[str, tuple[str, str]] = {}
        self.definitions: list[dict[str, Any]] = []
        self.failures: list[str] = []
        self.records: dict[str, McpRecord] = {}
        self._auth_states: dict[str, str] = {}
        self._jobs: asyncio.Queue[
            tuple[Any, tuple[Any, ...], dict[str, Any], asyncio.Future[Any]] | None
        ] = asyncio.Queue()
        self._worker: asyncio.Task[None] | None = None

    async def start(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self._worker = asyncio.create_task(self._run_worker(), name="snorlax-mcp")
        await self._on_worker(self._boot)

    async def _run_worker(self) -> None:
        while True:
            job = await self._jobs.get()
            if job is None:
                await self._shutdown_sessions()
                return
            fn, args, kwargs, fut = job
            try:
                result = await fn(*args, **kwargs)
            except BaseException as exc:  # noqa: BLE001 — surface to waiter
                if not fut.cancelled():
                    fut.set_exception(exc)
            else:
                if not fut.cancelled():
                    fut.set_result(result)

    async def _on_worker(self, fn: Any, *args: Any, **kwargs: Any) -> Any:
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[Any] = loop.create_future()
        await self._jobs.put((fn, args, kwargs, fut))
        return await fut

    async def _boot(self) -> None:
        if self.data_dir is None:
            return
        config = load_mcp_config(self.data_dir)
        specs = mcp_servers_from_config(config)
        for name, spec in specs.items():
            rec = self._ensure_record(name, spec)
            if _is_disabled(spec):
                rec.status = STATUS_DISCONNECTED
                continue
            try:
                await asyncio.wait_for(self._connect(name, spec), timeout=INIT_TIMEOUT + 5)
            except Exception as exc:  # noqa: BLE001 — boot must continue
                await self._apply_connect_failure(name, spec, exc)

    def _ensure_record(self, name: str, spec: dict[str, Any]) -> McpRecord:
        rec = self.records.get(name)
        if rec is None:
            rec = McpRecord(name, spec)
            self.records[name] = rec
        else:
            rec.spec = spec
            if spec.get("tools"):
                rec.cached_tools = _cached_tool_defs(spec.get("tools"))
        return rec

    async def _apply_connect_failure(
        self, name: str, spec: dict[str, Any], exc: BaseException
    ) -> None:
        rec = self._ensure_record(name, spec)
        rec.error = str(exc)
        if _is_auth_error(exc):
            rec.status = STATUS_NEEDS_AUTH
            log.warning("MCP server %s needs auth: %s", name, exc)
            print(f"  mcp {name} needs auth: {exc}", flush=True)
            return
        rec.status = STATUS_ERROR
        msg = f"{name}: {exc}"
        self.failures.append(msg)
        log.warning("MCP server %s failed to start: %s", name, exc)
        print(f"  mcp {name} failed: {exc}", flush=True)

    async def _connect(self, name: str, spec: dict[str, Any]) -> None:
        await self._drop_live(name)
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
            rec = self._ensure_record(name, spec)
            rec.status = STATUS_CONNECTED
            rec.error = None
            rec.cached_tools = _tools_cache(listed)
            stored = dict(spec)
            stored["disabled"] = False
            stored["tools"] = rec.cached_tools
            rec.spec = stored
            self._write_spec(name, stored)
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

    def _drop_server_tools(self, server: str) -> None:
        drop = [q for q, (name, _) in self.qualified.items() if name == server]
        for qualified in drop:
            self.qualified.pop(qualified, None)
        self.definitions = [
            item
            for item in self.definitions
            if item.get("function", {}).get("name") not in drop
        ]

    async def _drop_live(self, name: str) -> None:
        conn = self.servers.pop(name, None)
        self._drop_server_tools(name)
        if conn is None:
            return
        try:
            await conn.stack.aclose()
        except Exception as exc:  # noqa: BLE001
            log.warning("MCP server %s close failed: %s", name, exc)

    def _write_spec(self, name: str, spec: dict[str, Any]) -> None:
        if self.data_dir is None:
            return
        config = load_mcp_config(self.data_dir)
        servers = config.get("mcpServers")
        if not isinstance(servers, dict):
            servers = {}
            config["mcpServers"] = servers
        servers[name] = spec
        save_mcp_config(self.data_dir, config)

    def _drop_spec(self, name: str) -> None:
        if self.data_dir is None:
            return
        config = load_mcp_config(self.data_dir)
        servers = config.get("mcpServers")
        if not isinstance(servers, dict):
            return
        servers.pop(name, None)
        config["mcpServers"] = servers
        save_mcp_config(self.data_dir, config)

    def _unique_name(self, raw: str) -> str:
        base = _sanitize_server_name(raw) or "custom"
        name = base
        n = 2
        while name in self.records:
            name = f"{base}{n}"[:SERVER_NAME_RE_MAX]
            n += 1
        return name

    def public_row(self, name: str) -> dict[str, Any]:
        rec = self.records[name]
        return {
            "id": rec.name,
            "name": rec.display_name,
            "status": (
                STATUS_CONNECTED if name in self.servers else STATUS_NEEDS_AUTH
            ),
        }

    def list_public(self) -> list[dict[str, Any]]:
        return [self.public_row(name) for name in self.records]

    async def add_server(self, payload: dict[str, Any]) -> dict[str, Any]:
        return await self._on_worker(self._add_server_locked, payload)

    async def _add_server_locked(self, payload: dict[str, Any]) -> dict[str, Any]:
        display = str(payload.get("name") or "").strip()
        if not display:
            raise McpConfigError("name is required")
        stdio = payload.get("stdio")
        url = str(payload.get("url") or "").strip()
        has_stdio = isinstance(stdio, dict)
        if stdio is not None and not has_stdio:
            raise McpConfigError("stdio must be an object")
        if has_stdio and url:
            raise McpConfigError("provide stdio or url, not both")
        if not has_stdio and not url:
            raise McpConfigError("stdio or url is required")
        command = ""
        args: list[str] = []
        if has_stdio:
            command = str(stdio.get("command") or "").strip()
            if not command:
                raise McpConfigError("stdio.command is required")
            raw_args = stdio.get("args")
            if raw_args is None:
                raw_args = []
            if not isinstance(raw_args, list) or any(
                not isinstance(item, str) for item in raw_args
            ):
                raise McpConfigError("stdio.args must be a list of strings")
            args = list(raw_args)
        if url:
            ok, reason = mcp_url_allowed(url)
            if not ok:
                raise McpConfigError(reason)
        name = self._unique_name(display)
        spec: dict[str, Any] = {"name": display, "disabled": False}
        if command:
            spec["command"] = command
            spec["args"] = args
        if url:
            spec["url"] = url
        rec = self._ensure_record(name, spec)
        rec.status = STATUS_DISCONNECTED
        rec.error = None
        self._write_spec(name, spec)
        return await self._connect_server_locked(name)

    async def remove_server(self, name: str) -> None:
        await self._on_worker(self._remove_server_locked, name)

    async def _remove_server_locked(self, name: str) -> None:
        if name not in self.records:
            raise McpConfigError(f"plugin {name!r} not found", status=404)
        await self._drop_live(name)
        self.records.pop(name, None)
        self._drop_spec(name)

    async def connect_server(
        self, name: str, token: str | None = None
    ) -> dict[str, Any]:
        return await self._on_worker(self._connect_server_locked, name, token)

    async def _connect_server_locked(
        self, name: str, token: str | None = None
    ) -> dict[str, Any]:
        rec = self.records.get(name)
        if rec is None:
            raise McpConfigError(f"server {name!r} not found", status=404)
        spec = dict(rec.spec)
        if token:
            headers = dict(spec.get("headers") or {})
            headers["Authorization"] = f"Bearer {token.strip()}"
            spec["headers"] = headers
        spec["disabled"] = False
        rec.spec = spec
        rec.error = None
        if rec.status == STATUS_CONNECTED and name in self.servers and not token:
            return self.public_row(name)
        try:
            await asyncio.wait_for(self._connect(name, spec), timeout=INIT_TIMEOUT + 5)
        except Exception as exc:  # noqa: BLE001 — chrome must not crash
            await self._apply_connect_failure(name, spec, exc)
            self._write_spec(name, spec)
        return self.public_row(name)

    async def disconnect_server(self, name: str) -> dict[str, Any]:
        return await self._on_worker(self._disconnect_server_locked, name)

    async def _disconnect_server_locked(self, name: str) -> dict[str, Any]:
        rec = self.records.get(name)
        if rec is None:
            raise McpConfigError(f"server {name!r} not found", status=404)
        await self._drop_live(name)
        spec = dict(rec.spec)
        spec["disabled"] = True
        if rec.cached_tools:
            spec["tools"] = rec.cached_tools
        rec.spec = spec
        rec.status = STATUS_DISCONNECTED
        rec.error = None
        self._write_spec(name, spec)
        return self.public_row(name)

    def begin_auth(self, name: str) -> str:
        if name not in self.records:
            raise McpConfigError(f"plugin {name!r} not found", status=404)
        state = secrets.token_urlsafe(18)
        self._auth_states[state] = name
        return state

    def plugin_for_state(self, state: str) -> str | None:
        return self._auth_states.get(state)

    def consume_auth_state(self, state: str) -> str | None:
        return self._auth_states.pop(state, None)

    def upstream_authorize_url(self, name: str, callback: str) -> str | None:
        rec = self.records.get(name)
        if rec is None:
            return None
        raw = str(rec.spec.get("authUrl") or rec.spec.get("auth_url") or "").strip()
        if not raw:
            return None
        return _with_redirect(raw, callback)

    async def complete_auth(self, state: str, token: str | None) -> dict[str, Any]:
        name = self.consume_auth_state(state)
        if not name:
            raise McpConfigError("invalid auth state", status=422)
        return await self.connect_server(name, token=token)

    def stub_openai_tools(self) -> list[dict[str, Any]]:
        offered: list[dict[str, Any]] = []
        seen = set(self.qualified)
        for rec in self.records.values():
            if rec.name in self.servers:
                continue
            tools = list(rec.cached_tools)
            if not tools:
                tools = [
                    {
                        "name": "use",
                        "description": (
                            f"Use {rec.display_name}. The user must connect "
                            "this server first."
                        ),
                        "inputSchema": {"type": "object", "properties": {}},
                    }
                ]
            for tool in tools:
                original = str(tool.get("name") or "use").strip() or "use"
                qualified = qualify_tool_name(rec.name, original)
                if qualified in BUILTIN_TOOL_NAMES or qualified in seen:
                    continue
                seen.add(qualified)
                schema = tool.get("inputSchema")
                if not isinstance(schema, dict) or not schema:
                    schema = {"type": "object", "properties": {}}
                description = (
                    str(tool.get("description") or "").strip()
                    or f"Requires {rec.display_name} to be connected."
                )
                offered.append(
                    {
                        "type": "function",
                        "function": {
                            "name": qualified,
                            "description": description,
                            "parameters": schema,
                        },
                    }
                )
        return offered

    def has_tool(self, name: str) -> bool:
        return name in self.qualified

    def openai_tools(self) -> list[dict[str, Any]]:
        return list(self.definitions) + self.stub_openai_tools()

    def tool_names(self) -> list[str]:
        return list(self.qualified.keys())

    def connect_needed(self, qualified: str) -> str | None:
        if self.has_tool(qualified):
            return None
        split = split_qualified(qualified)
        if split is None:
            return None
        server, _tool = split
        rec = self.records.get(server)
        if rec is None:
            return None
        if rec.status == STATUS_CONNECTED:
            return None
        return server

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
        if self._worker is not None:
            await self._jobs.put(None)
            try:
                await self._worker
            except Exception as exc:  # noqa: BLE001
                log.warning("MCP worker stop failed: %s", exc)
            self._worker = None
            return
        await self._shutdown_sessions()

    async def _shutdown_sessions(self) -> None:
        self._auth_states.clear()
        for conn in list(self.servers.values()):
            try:
                await conn.stack.aclose()
            except Exception as exc:  # noqa: BLE001
                log.warning("MCP server %s close failed: %s", conn.name, exc)
        self.servers.clear()
        self.qualified.clear()
        self.definitions.clear()
        self.records.clear()


def _with_redirect(url: str, callback: str) -> str:
    parsed = urlparse(url)
    extra = parse_qs(parsed.query, keep_blank_values=True)
    extra["redirect_uri"] = [callback]
    query = urlencode(extra, doseq=True)
    return urlunparse(parsed._replace(query=query))


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


def plugin_is_connected(name: str) -> bool:
    manager = get_mcp_manager()
    if manager is None or name not in manager.records:
        return False
    return manager.public_row(name).get("status") == STATUS_CONNECTED


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


def connect_needed_server(name: str) -> str | None:
    manager = get_mcp_manager()
    if manager is None:
        return None
    return manager.connect_needed(name)


def connect_card_for_tool(name: str) -> dict[str, Any] | None:
    from snorlax_runtime.connect import connect_card

    manager = get_mcp_manager()
    if manager is None:
        return None
    server_id = manager.connect_needed(name)
    if not server_id:
        return None
    rec = manager.records.get(server_id)
    display = rec.display_name if rec is not None else server_id
    return connect_card(server_id, display)


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
