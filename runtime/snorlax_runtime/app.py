# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import asyncio
import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response, StreamingResponse

from snorlax_runtime import KIND_AGENT, KIND_CHANNEL, SEEDED_CHANNEL_ID, __version__
from snorlax_runtime.auth import require_bearer
from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store, dump_json
from snorlax_runtime.inference import build_backend
from snorlax_runtime.routing import (
    MentionError,
    resolve_user_mentions,
    resume_after_connect,
    run_user_turn,
)
from snorlax_runtime.computer import (
    ComputerError,
    ComputerHub,
    configure_computer,
)
from snorlax_runtime.schemas import (
    Agent,
    AgentCreate,
    AgentPatch,
    ComputerPreview,
    ComputerRecording,
    ComputerSession,
    Health,
    KeyEvent,
    PointerEvent,
    Message,
    MessageCreate,
    Plugin,
    PluginAuth,
    PluginCreate,
    Routine,
    RoutineCreate,
    RoutinePatch,
    SkillCreate,
    SkillInfo,
    WorkspaceFile,
    WorkspaceListing,
)
from snorlax_runtime.widgets import PENDING_ERROR, STATUS_PENDING, WidgetAnswerError, require_reply_values
from snorlax_runtime.connect import (
    CONNECT_KIND,
    PENDING_ERROR as CONNECT_PENDING_ERROR,
    STATUS_CONNECTED as CONNECT_CONNECTED,
    STATUS_PENDING as CONNECT_PENDING,
)
from snorlax_runtime.token import resolve_token, write_token_file
from snorlax_runtime.mcp import McpConfigError, start_mcp, stop_mcp
from snorlax_runtime.tools import (
    BinaryFileError,
    PathJailError,
    configure_tools,
    drop_workspace,
    list_workspace,
    read_workspace_file,
)


def _error(status_code: int, message: str) -> HTTPException:
    return HTTPException(status_code=status_code, detail=message)


log = logging.getLogger("snorlax.app")

PLUGIN_CONNECTED = "connected"


def _base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


def _routine_out(row: dict, base_url: str) -> Routine:
    kind = str(row.get("triggerType") or "cron").strip().lower() or "cron"
    if kind not in {"cron", "webhook", "slack", "github"}:
        kind = "cron"
    schedule = row.get("schedule") or None
    stored_label = row.get("scheduleLabel") or None
    webhook_url = None
    label = None
    schedule_label = None
    if kind == "webhook":
        token = row.get("webhookKey") or ""
        if token:
            webhook_url = f"{base_url}/v1/hooks/{token}"
        schedule = None
    elif kind in {"slack", "github"}:
        schedule = None
        label = stored_label
        if not label:
            label = "Slack" if kind == "slack" else "GitHub"
    else:
        schedule_label = stored_label
    return Routine(
        id=row["id"],
        name=row["name"],
        skill=row["skill"],
        enabled=bool(row.get("enabled", True)),
        kind=kind,
        schedule=schedule,
        scheduleLabel=schedule_label,
        webhookUrl=webhook_url,
        label=label,
    )


def _plugin_kind_connected(manager: object | None, kind: str) -> bool:
    if manager is None:
        return False
    listed = getattr(manager, "list_public", None)
    if not callable(listed):
        return False
    needle = kind.strip().lower()
    for row in listed() or []:
        if not isinstance(row, dict):
            continue
        if str(row.get("status") or "") != PLUGIN_CONNECTED:
            continue
        blob = f"{row.get('id', '')} {row.get('name', '')}".lower()
        if needle in blob:
            return True
    return False


def _connect_html() -> HTMLResponse:
    html = (
        "<!doctype html><title>Snorlax-Bot</title>"
        "<p>Connected. You can close this window.</p>"
    )
    return HTMLResponse(html)


async def _resume_connect_cards(request: Request, plugin_id: str) -> None:
    store: Store = request.app.state.store
    backend = request.app.state.backend
    rounds = request.app.state.settings.tool_max_rounds
    cards = await store.list_pending_connects(plugin_id)
    for card in cards:
        updated = await store.resolve_connect(card["id"], status=CONNECT_CONNECTED)
        if updated is None:
            continue
        try:
            await resume_after_connect(
                store=store,
                backend=backend,
                card=updated,
                max_tool_rounds=rounds,
            )
        except Exception as exc:  # noqa: BLE001 — callback must still return HTML
            log.warning("resume after connect %s failed: %s", card["id"], extra)


async def _finish_plugin_oauth(
    request: Request,
    *,
    state: str,
    code: str | None,
    token: str | None,
    access_token: str | None,
) -> HTMLResponse:
    manager = getattr(request.app.state, "mcp", None)
    if manager is None:
        raise _error(500, "MCP is not running")
    secret = (token or access_token or code or "").strip() or "local"
    try:
        row = await manager.complete_auth(state, secret)
    except McpConfigError as exc:
        raise _error(exc.status, exc.message) from exc
    plugin_id = str(row.get("id") or "")
    if plugin_id:
        await _resume_connect_cards(request, plugin_id)
    return _connect_html()


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = Store(settings.data_dir)
        await store.connect()
        token = resolve_token(env_token=settings.token, data_dir=settings.data_dir)
        if not token:
            token = secrets.token_urlsafe(32)
            write_token_file(settings.data_dir, token)
        app.state.settings = settings
        app.state.store = store
        configure_tools(
            search_provider=settings.search_provider,
            search_url=settings.search_url,
        )
        mcp = await start_mcp(settings.data_dir)
        app.state.mcp = mcp
        app.state.computer = ComputerHub(settings.data_dir)
        configure_computer(app.state.computer)
        backend_name = settings.resolved_backend()
        app.state.backend = build_backend(
            backend_name,
            vllm_base_url=settings.vllm_base_url,
            omlx_base_url=settings.omlx_base_url,
            model=settings.model,
            api_key=settings.inference_api_key,
            send_auth=settings.inference_send_auth,
        )
        scheduler_task = None
        if settings.scheduler:
            from snorlax_runtime.scheduler import run_scheduler

            scheduler_task = asyncio.create_task(
                run_scheduler(app, interval=settings.scheduler_interval),
                name="snorlax-scheduler",
            )
        app.state.scheduler_task = scheduler_task
        inference_url = settings.inference_base_url() or "(mock)"
        print(
            "Snorlax-Bot runtime ready\n"
            f"  data: {settings.data_dir}\n"
            f"  db: {settings.data_dir / 'snorlax.db'}\n"
            f"  token file: {settings.data_dir / 'token'}\n"
            f"  bind: {settings.bind or '(set by process)'}:{settings.port}\n"
            f"  backend: {backend_name}\n"
            f"  inference: {inference_url}\n"
            f"  model: {settings.model}\n"
            f"  search: {settings.search_provider}"
            f"{' ' + settings.search_url if settings.search_url else ''}\n"
            f"  mcp: {len(mcp.servers)} server(s), {len(mcp.qualified)} tool(s)"
            f"{' (none)' if not mcp.servers and not mcp.failures else ''}\n"
            f"  scheduler: {'on' if settings.scheduler else 'off'} "
            f"(Asia/Taipei)\n"
            f"  token: {token}",
            flush=True,
        )
        yield
        task = getattr(app.state, "scheduler_task", None)
        if task is not None:
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
        await stop_mcp(mcp)
        await store.close()

    app = FastAPI(
        title="Snorlax-Bot",
        version=__version__,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(status_code=exc.status_code, content={"error": message})

    @app.exception_handler(RequestValidationError)
    async def validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        msg = str(exc.errors()[0]["msg"]) if exc.errors() else "Invalid request"
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"error": msg},
        )

    @app.get("/health")
    async def process_health() -> dict[str, bool]:
        return {"ok": True}

    @app.get("/v1/health", response_model=Health)
    async def health() -> Health:
        return Health(ok=True, name="Snorlax-Bot", version=__version__)

    @app.get("/v1/agents", response_model=list[Agent])
    async def list_agents(
        request: Request, _: str = Depends(require_bearer)
    ) -> list[Agent]:
        store: Store = request.app.state.store
        return [Agent.model_validate(r) for r in await store.list_agents()]

    @app.post(
        "/v1/agents",
        response_model=Agent,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_agent(
        request: Request,
        _: str = Depends(require_bearer),
        payload: AgentCreate = Body(default_factory=AgentCreate),
    ) -> Agent:
        store: Store = request.app.state.store
        kind = (payload.kind or KIND_AGENT).strip().lower()
        if kind not in {KIND_AGENT, KIND_CHANNEL}:
            raise _error(422, "kind must be agent or channel")
        if kind == KIND_CHANNEL:
            fields = payload.model_dump(exclude_unset=True)
            if "name" not in fields:
                raise _error(422, "missing name")
            name = payload.name
            roster = await store.list_agents()
            member_ids = _channel_member_ids(
                roster, list(payload.memberIds or []), snapshot_if_empty=True
            )
            row = await store.create_channel(
                name,
                payload.title,
                payload.description,
                payload.avatar,
                member_ids,
            )
            return Agent.model_validate(row)
        row = await store.create_agent(
            payload.name, payload.title, payload.description, payload.avatar
        )
        return Agent.model_validate(row)

    @app.get("/v1/agents/{id}", response_model=Agent)
    async def get_agent(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> Agent:
        store: Store = request.app.state.store
        row = await store.get_agent(id)
        if row is None:
            raise _error(404, f"Agent {id!r} not found")
        return Agent.model_validate(row)

    @app.patch("/v1/agents/{id}", response_model=Agent)
    async def patch_agent(
        id: str,
        payload: AgentPatch,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Agent:
        store: Store = request.app.state.store
        existing = await store.get_agent(id)
        if existing is None:
            raise _error(404, f"Agent {id!r} not found")
        fields = payload.model_dump(exclude_unset=True)
        identity = {"name", "title", "description", "avatar", "memberIds"}
        if existing.get("kind") != KIND_CHANNEL and "sharedProject" in fields:
            raise _error(422, "sharedProject is a channel field")
        if id == SEEDED_CHANNEL_ID:
            if identity & fields.keys() or "sharedProject" not in fields:
                raise _error(409, "seeded channel cannot be patched")
            row = await store.patch_agent(
                id,
                name=None,
                title=None,
                description=None,
                avatar=...,
                shared_project=bool(fields["sharedProject"]),
            )
            if row is None:
                raise _error(404, f"Agent {id!r} not found")
            return Agent.model_validate(row)
        if existing.get("kind") == KIND_CHANNEL:
            if "name" in fields or "sharedProject" in fields:
                row = await store.patch_agent(
                    id,
                    name=fields.get("name"),
                    title=None,
                    description=None,
                    avatar=...,
                    shared_project=(
                        bool(fields["sharedProject"])
                        if "sharedProject" in fields
                        else ...
                    ),
                )
                if row is None:
                    raise _error(404, f"Agent {id!r} not found")
            if "memberIds" in fields:
                roster = await store.list_agents()
                member_ids = _channel_member_ids(
                    roster, list(fields.get("memberIds") or []), snapshot_if_empty=False
                )
                await store.set_channel_members(id, member_ids)
            row = await store.get_agent(id)
            if row is None:
                raise _error(404, f"Agent {id!r} not found")
            return Agent.model_validate(row)
        row = await store.patch_agent(
            id,
            name=fields.get("name"),
            title=fields.get("title"),
            description=fields.get("description"),
            avatar=fields["avatar"] if "avatar" in fields else ...,
        )
        if row is None:
            raise _error(404, f"Agent {id!r} not found")
        return Agent.model_validate(row)

    @app.delete("/v1/agents/{id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_agent(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> None:
        store: Store = request.app.state.store
        existing = await store.get_agent(id)
        if existing is None:
            raise _error(404, f"Agent {id!r} not found")
        deleted = await store.delete_agent(id)
        if not deleted:
            raise _error(404, f"Agent {id!r} not found")
        drop_workspace(
            store.data_dir,
            "channels" if existing.get("kind") == KIND_CHANNEL else "agents",
            id,
        )
        hub = getattr(request.app.state, "computer", None)
        if hub is not None:
            hub.detach(id)

    @app.get("/v1/agents/{id}/messages", response_model=list[Message])
    async def list_messages(
        id: str,
        request: Request,
        _: str = Depends(require_bearer),
        limit: int = Query(default=100, ge=1, le=200),
        before: str | None = None,
        threadId: str | None = Query(default=None),
        replyTo: str | None = Query(default=None),
    ) -> list[Message]:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        if conversation is None:
            raise _error(404, f"Agent {id!r} not found")
        thread_id = threadId or replyTo
        rows = await store.list_messages(
            id, limit=limit, before=before, thread_id=thread_id
        )
        return [Message.model_validate(r) for r in rows]

    @app.post("/v1/agents/{id}/messages")
    async def post_message(
        id: str,
        payload: MessageCreate,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> StreamingResponse:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        if conversation is None:
            raise _error(404, f"Agent {id!r} not found")
        if conversation.get("kind") != KIND_CHANNEL and _computer(
            request
        ).has_session(id):
            raise _error(409, "computer session is active")
        roster = await store.list_agents()
        is_group = conversation.get("kind") == "channel"
        try:
            mentions = resolve_user_mentions(
                payload.content,
                payload.mentions,
                roster,
                is_group=is_group,
            )
        except MentionError as exc:
            raise _error(422, exc.message) from exc
        images = [img.model_dump() for img in payload.images]
        backend = request.app.state.backend
        stored_reply_to = None
        if is_group and payload.replyTo:
            stored_reply_to = await store.resolve_thread_root(id, payload.replyTo)
        pending = await store.pending_widget(
            id, thread_id=stored_reply_to if is_group else None
        )
        pending_connect = await store.pending_connect(
            id, thread_id=stored_reply_to if is_group else None
        )
        if payload.widgetReply is not None:
            target = await store.get_message(payload.widgetReply.id)
            if target is None or target.get("agentId") != id:
                raise _error(422, "widget not found")
            if is_group:
                target_thread = target.get("replyTo") or target["id"]
                if stored_reply_to and target_thread != stored_reply_to:
                    raise _error(422, "widget not in this thread")
            if target.get("kind") != "widget":
                raise _error(422, "widget not found")
            if target.get("widgetStatus") != STATUS_PENDING:
                raise _error(422, "widget is not pending")
            if not payload.widgetReply.dismissed:
                try:
                    require_reply_values(
                        list(payload.widgetReply.values or []),
                        target.get("widget") or {},
                    )
                except WidgetAnswerError as exc:
                    raise _error(422, exc.message) from exc
        elif payload.connectReply is not None:
            target_id = (payload.connectReply.id or "").strip()
            target = None
            if target_id:
                target = await store.get_message(target_id)
            else:
                target = pending_connect
            if target is None or target.get("agentId") != id:
                raise _error(422, "connect card not found")
            if is_group:
                target_thread = target.get("replyTo") or target["id"]
                if stored_reply_to and target_thread != stored_reply_to:
                    raise _error(422, "connect card not in this thread")
            if target.get("kind") != CONNECT_KIND:
                raise _error(422, "connect card not found")
            if target.get("connectStatus") != CONNECT_PENDING:
                raise _error(422, "connect card is not pending")
            if not payload.connectReply.dismissed:
                body = target.get("connect") or {}
                plugin_id = (
                    str(body.get("pluginId") or "").strip()
                    if isinstance(body, dict)
                    else ""
                )
                manager = getattr(request.app.state, "mcp", None)
                if manager is None or plugin_id not in manager.records:
                    raise _error(404, f"plugin {plugin_id!r} not found")
        elif (payload.content or "").strip() and pending is not None:
            body = pending.get("widget") or {}
            if not body.get("dismissOnMoveOn"):
                raise _error(409, PENDING_ERROR)
        elif (payload.content or "").strip() and pending_connect is not None:
            raise _error(409, CONNECT_PENDING_ERROR)

        async def events() -> AsyncIterator[bytes]:
            async for event, data in run_user_turn(
                store=store,
                backend=backend,
                conversation=conversation,
                content=payload.content or "",
                images=images,
                mentions=mentions,
                reply_to=payload.replyTo,
                preferred_channel_id=payload.channelId,
                max_tool_rounds=request.app.state.settings.tool_max_rounds,
                widget_reply=(
                    payload.widgetReply.model_dump()
                    if payload.widgetReply is not None
                    else None
                ),
                connect_reply=(
                    payload.connectReply.model_dump()
                    if payload.connectReply is not None
                    else None
                ),
                auth_base_url=str(request.base_url).rstrip("/"),
            ):
                yield _sse(event, data)

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    def _require_agent(
        conversation: dict | None,
        agent_id: str,
        *,
        channel_status: int,
        reason: str = "routines are assigned to an agent",
    ) -> dict:
        if conversation is None:
            raise _error(404, f"Agent {agent_id!r} not found")
        if conversation.get("kind") == KIND_CHANNEL:
            raise _error(channel_status, reason)
        return conversation

    @app.get(
        "/v1/agents/{id}/routines",
        response_model=list[Routine],
        response_model_exclude_none=True,
    )
    async def list_routines(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> list[Routine]:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(conversation, id, channel_status=409)
        manager = getattr(request.app.state, "mcp", None)
        visible = []
        for row in await store.list_routines(id):
            kind = str(row.get("triggerType") or "cron").strip().lower() or "cron"
            if kind in {"slack", "github"} and not _plugin_kind_connected(
                manager, kind
            ):
                continue
            visible.append(_routine_out(row, _base_url(request)))
        return visible

    @app.post(
        "/v1/agents/{id}/routines",
        response_model=Routine,
        response_model_exclude_none=True,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_routine(
        id: str,
        payload: RoutineCreate,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Routine:
        from snorlax_runtime.cron import CronError, parse_schedule
        from snorlax_runtime.skills import find_skill, load_skills, skill_slug

        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(conversation, id, channel_status=422)
        skill_name = payload.skill.strip()
        matched = find_skill(load_skills(store.data_dir), skill_name)
        if matched is None:
            raise _error(422, "unknown skill")
        trigger = payload.trigger
        if trigger is not None:
            kind = trigger.type
            if kind in {"slack", "github"}:
                manager = getattr(request.app.state, "mcp", None)
                if not _plugin_kind_connected(manager, kind):
                    raise _error(
                        422,
                        f"{kind} trigger requires a connected {kind} MCP plugin",
                    )
                display = trigger.label or (
                    "Slack" if kind == "slack" else "GitHub"
                )
                row = await store.create_routine(
                    agent_id=id,
                    name=payload.name.strip(),
                    skill=skill_slug(matched),
                    cron="",
                    schedule_label=display,
                    trigger_type=kind,
                )
                return _routine_out(row, _base_url(request))
            key = secrets.token_urlsafe(32)
            row = await store.create_routine(
                agent_id=id,
                name=payload.name.strip(),
                skill=skill_slug(matched),
                cron="",
                schedule_label="",
                trigger_type="webhook",
                webhook_key=key,
            )
            return _routine_out(row, _base_url(request))
        try:
            cron, label = parse_schedule(payload.schedule or "")
        except CronError as exc:
            raise _error(422, exc.message) from exc
        row = await store.create_routine(
            agent_id=id,
            name=payload.name.strip(),
            skill=skill_slug(matched),
            cron=cron,
            schedule_label=label,
        )
        return _routine_out(row, _base_url(request))

    @app.patch(
        "/v1/agents/{id}/routines/{routineId}",
        response_model=Routine,
        response_model_exclude_none=True,
    )
    async def patch_routine(
        id: str,
        routineId: str,
        payload: RoutinePatch,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Routine:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(conversation, id, channel_status=409)
        row = await store.patch_routine(
            routineId,
            agent_id=id,
            enabled=payload.enabled,
        )
        if row is None:
            raise _error(404, f"Routine {routineId!r} not found")
        return _routine_out(row, _base_url(request))

    @app.post("/v1/hooks/{token}", status_code=status.HTTP_204_NO_CONTENT)
    async def fire_webhook(token: str, request: Request) -> Response:
        """POST the minted webhookUrl. Token is in the path. No Bearer."""
        from snorlax_runtime.scheduler import fire_routine_now

        store: Store = request.app.state.store
        row = await store.get_routine_by_webhook_token(token)
        if (
            row is None
            or str(row.get("triggerType") or "") != "webhook"
            or not row.get("enabled")
        ):
            raise _error(404, "Not found")
        try:
            await fire_routine_now(
                store,
                request.app.state.backend,
                row,
                max_tool_rounds=getattr(
                    request.app.state.settings, "tool_max_rounds", None
                ),
            )
        except Exception:
            log.exception("webhook routine %s failed", row.get("id"))
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    @app.get("/v1/agents/{id}/skills", response_model=list[SkillInfo])
    async def list_skills(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> list[SkillInfo]:
        from snorlax_runtime.skills import load_skills
        from snorlax_runtime.tools import workspace_for

        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(conversation, id, channel_status=422)
        workspace = workspace_for(store.data_dir, conversation, id)
        skills = load_skills(store.data_dir, workspace)
        return [SkillInfo.model_validate(s.public()) for s in skills]

    @app.post(
        "/v1/agents/{id}/skills",
        response_model=SkillInfo,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_skill(
        id: str,
        payload: SkillCreate,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> SkillInfo:
        from snorlax_runtime.skills import write_taught_skill

        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            capture = _computer(request).take_capture(id)
            skill = write_taught_skill(store.data_dir, payload.name, capture)
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc
        except ValueError as exc:
            raise _error(422, str(exc)) from exc
        return SkillInfo.model_validate(skill.public())

    @app.get("/v1/agents/{id}/workspace", response_model=WorkspaceListing)
    async def get_workspace(
        id: str,
        request: Request,
        _: str = Depends(require_bearer),
        path: str = Query(default="."),
    ) -> WorkspaceListing:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        if conversation is None:
            raise _error(404, f"Agent {id!r} not found")
        try:
            return WorkspaceListing.model_validate(
                list_workspace(store.data_dir, conversation, path)
            )
        except PathJailError as exc:
            raise _error(422, exc.message) from exc
        except FileNotFoundError:
            raise _error(404, "path not found") from None
        except NotADirectoryError:
            raise _error(422, "not a directory") from None

    @app.get("/v1/agents/{id}/workspace/file", response_model=WorkspaceFile)
    async def get_workspace_file(
        id: str,
        request: Request,
        _: str = Depends(require_bearer),
        path: str = Query(default="."),
    ) -> WorkspaceFile:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        if conversation is None:
            raise _error(404, f"Agent {id!r} not found")
        try:
            return WorkspaceFile.model_validate(
                read_workspace_file(store.data_dir, conversation, path)
            )
        except PathJailError as exc:
            raise _error(422, exc.message) from exc
        except BinaryFileError as exc:
            raise _error(422, exc.message) from exc
        except FileNotFoundError:
            raise _error(404, "path not found") from None
        except IsADirectoryError:
            raise _error(422, "not a file") from None

    def _computer(request: Request) -> ComputerHub:
        hub = getattr(request.app.state, "computer", None)
        if hub is None:
            store: Store = request.app.state.store
            hub = ComputerHub(store.data_dir)
            request.app.state.computer = hub
        return hub

    @app.get(
        "/v1/agents/{id}/computer",
        response_model=ComputerPreview,
        response_model_exclude_none=True,
    )
    async def get_computer(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> ComputerPreview:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer preview is agent-only",
        )
        return ComputerPreview.model_validate(_computer(request).preview(id))

    @app.get("/v1/agents/{id}/computer/screenshot")
    async def get_computer_screenshot(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> Response:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer preview is agent-only",
        )
        png = _computer(request).screenshot_png(id, str(conversation.get("name") or ""))
        if png is None:
            raise _error(404, "no computer")
        return Response(
            content=png,
            media_type="image/png",
            headers={"Cache-Control": "no-store"},
        )

    @app.post(
        "/v1/agents/{id}/computer/session",
        response_model=ComputerSession,
        status_code=status.HTTP_201_CREATED,
    )
    async def open_computer_session(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> ComputerSession:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        hub = _computer(request)
        opened = hub.open_session(id, str(conversation.get("name") or ""))
        if opened is None:
            raise _error(404, "no computer")
        return ComputerSession.model_validate(opened)

    @app.delete(
        "/v1/agents/{id}/computer/session",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    async def close_computer_session(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> None:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        _computer(request).close_session(id)

    @app.delete(
        "/v1/agents/{id}/computer/session/{sessionId}",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    async def close_computer_session_by_id(
        id: str,
        sessionId: str,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> None:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            _computer(request).close_session(id, session_id=sessionId)
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc

    @app.post(
        "/v1/agents/{id}/computer/pointer",
        status_code=status.HTTP_200_OK,
    )
    async def post_computer_pointer(
        id: str,
        payload: PointerEvent,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Response:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            _computer(request).pointer(
                id, payload.x, payload.y, payload.type, user=True
            )
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc
        return Response(status_code=status.HTTP_200_OK)

    @app.post(
        "/v1/agents/{id}/computer/key",
        status_code=status.HTTP_200_OK,
    )
    async def post_computer_key(
        id: str,
        payload: KeyEvent,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Response:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            _computer(request).key(
                id, payload.key, payload.type, user=True, text=payload.text
            )
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc
        return Response(status_code=status.HTTP_200_OK)

    @app.post(
        "/v1/agents/{id}/computer/record",
        response_model=ComputerRecording,
        status_code=status.HTTP_201_CREATED,
    )
    async def start_computer_record(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> ComputerRecording:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            started = _computer(request).start_record(id)
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc
        return ComputerRecording.model_validate(started)

    @app.delete(
        "/v1/agents/{id}/computer/record",
        status_code=status.HTTP_204_NO_CONTENT,
    )
    async def stop_computer_record(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> None:
        store: Store = request.app.state.store
        conversation = await store.get_agent(id)
        _require_agent(
            conversation,
            id,
            channel_status=409,
            reason="computer session is agent-only",
        )
        try:
            _computer(request).stop_record(id)
        except ComputerError as exc:
            raise _error(exc.status, exc.message) from exc

    @app.get("/v1/plugins", response_model=list[Plugin])
    async def list_plugins(
        request: Request, _: str = Depends(require_bearer)
    ) -> list[Plugin]:
        manager = getattr(request.app.state, "mcp", None)
        if manager is None:
            return []
        return [Plugin.model_validate(row) for row in manager.list_public()]

    @app.post(
        "/v1/plugins",
        response_model=Plugin,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_plugin(
        request: Request,
        payload: PluginCreate,
        _: str = Depends(require_bearer),
    ) -> Plugin:
        manager = getattr(request.app.state, "mcp", None)
        if manager is None:
            raise _error(500, "MCP is not running")
        try:
            row = await manager.add_server(payload.model_dump())
        except McpConfigError as exc:
            raise _error(exc.status, exc.message) from exc
        return Plugin.model_validate(row)

    @app.delete("/v1/plugins/{id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_plugin(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> None:
        manager = getattr(request.app.state, "mcp", None)
        if manager is None:
            raise _error(500, "MCP is not running")
        try:
            await manager.remove_server(id)
        except McpConfigError as exc:
            raise _error(exc.status, exc.message) from exc

    @app.post("/v1/plugins/{id}/auth", response_model=PluginAuth)
    async def start_plugin_auth(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> PluginAuth:
        manager = getattr(request.app.state, "mcp", None)
        if manager is None:
            raise _error(500, "MCP is not running")
        try:
            state = manager.begin_auth(id)
        except McpConfigError as exc:
            raise _error(exc.status, exc.message) from exc
        base = str(request.base_url).rstrip("/")
        authorization_url = f"{base}/v1/plugins/oauth/start/{id}?state={state}"
        return PluginAuth(authorizationUrl=authorization_url)

    @app.get("/v1/plugins/oauth/start/{id}")
    async def plugin_oauth_start(
        id: str, request: Request, state: str = Query(default="")
    ) -> Response:
        manager = getattr(request.app.state, "mcp", None)
        if manager is None or not state or manager.plugin_for_state(state) != id:
            raise _error(422, "invalid auth state")
        base = str(request.base_url).rstrip("/")
        callback = f"{base}/v1/plugins/oauth/callback?state={state}"
        upstream = manager.upstream_authorize_url(id, callback)
        target = upstream or f"{callback}&code=local"
        return RedirectResponse(url=target, status_code=302)

    @app.get("/v1/plugins/oauth/callback")
    async def plugin_oauth_callback(
        request: Request,
        state: str = Query(default=""),
        code: str | None = Query(default=None),
        token: str | None = Query(default=None),
        access_token: str | None = Query(default=None),
    ) -> HTMLResponse:
        return await _finish_plugin_oauth(
            request,
            state=state,
            code=code,
            token=token,
            access_token=access_token,
        )

    @app.post("/v1/plugins/oauth/callback")
    async def plugin_oauth_callback_post(request: Request) -> HTMLResponse:
        state = str(request.query_params.get("state") or "")
        code = request.query_params.get("code")
        token = request.query_params.get("token")
        access_token = request.query_params.get("access_token")
        ctype = (request.headers.get("content-type") or "").split(";")[0].strip()
        if ctype == "application/json":
            body = await request.json()
            if isinstance(body, dict):
                state = str(body.get("state") or state)
                if body.get("code") is not None:
                    code = str(body.get("code") or "")
                if body.get("token") is not None:
                    token = str(body.get("token") or "")
                if body.get("access_token") is not None:
                    access_token = str(body.get("access_token") or "")
        return await _finish_plugin_oauth(
            request,
            state=state,
            code=code,
            token=token,
            access_token=access_token,
        )

    @app.get("/v1/images/{id}")
    async def get_image(
        id: str, request: Request, _: str = Depends(require_bearer)
    ) -> Response:
        store: Store = request.app.state.store
        found = await store.get_image(id)
        if found is None:
            raise _error(404, f"Image {id!r} not found")
        mime, body = found
        return Response(content=body, media_type=mime)

    return app


def _sse(event: str, data: dict) -> bytes:
    payload = dump_json(data)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


def _channel_member_ids(
    roster: list,
    requested: list[str],
    *,
    snapshot_if_empty: bool,
) -> list[str]:
    agents = [a for a in roster if a.get("kind") != KIND_CHANNEL]
    channel_ids = {a["id"] for a in roster if a.get("kind") == KIND_CHANNEL}
    agent_ids = {a["id"] for a in agents}
    if not requested:
        if snapshot_if_empty:
            return [a["id"] for a in agents]
        return []
    member_ids: list[str] = []
    seen: set[str] = set()
    for raw_id in requested:
        if raw_id in seen:
            continue
        if raw_id in channel_ids:
            raise _error(422, "memberIds must be agent ids")
        if raw_id not in agent_ids:
            raise _error(422, "Unknown member id")
        seen.add(raw_id)
        member_ids.append(raw_id)
    return member_ids
