# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from snorlax_runtime import KIND_AGENT, KIND_CHANNEL, SEEDED_CHANNEL_ID, __version__
from snorlax_runtime.auth import require_bearer
from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store, dump_json
from snorlax_runtime.inference import build_backend
from snorlax_runtime.routing import MentionError, resolve_user_mentions, run_user_turn
from snorlax_runtime.schemas import (
    Agent,
    AgentCreate,
    AgentPatch,
    Health,
    Message,
    MessageCreate,
    WorkspaceFile,
    WorkspaceListing,
)
from snorlax_runtime.widgets import PENDING_ERROR, STATUS_PENDING, WidgetAnswerError, require_reply_values
from snorlax_runtime.token import resolve_token, write_token_file
from snorlax_runtime.mcp import start_mcp, stop_mcp
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
        backend_name = settings.resolved_backend()
        app.state.backend = build_backend(
            backend_name,
            vllm_base_url=settings.vllm_base_url,
            omlx_base_url=settings.omlx_base_url,
            model=settings.model,
            api_key=settings.inference_api_key,
            send_auth=settings.inference_send_auth,
        )
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
            f"  token: {token}",
            flush=True,
        )
        yield
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
        if payload.widgetReply is not None:
            target = await store.get_message(payload.widgetReply.id)
            if target is None or target.get("agentId") != id:
                raise _error(422, "widget not found")
            if is_group:
                target_thread = target.get("replyTo") or target["id"]
                if stored_reply_to and target_thread != stored_reply_to:
                    raise _error(422, "widget not in this thread")
            body = target.get("widget") or {}
            if body.get("status") != STATUS_PENDING:
                raise _error(422, "widget is not pending")
            try:
                require_reply_values(
                    list(payload.widgetReply.values or []), body
                )
            except WidgetAnswerError as exc:
                raise _error(422, exc.message) from exc
        elif payload.dismissed:
            if pending is None:
                raise _error(422, "no pending widget")
        elif (payload.content or "").strip() and pending is not None:
            body = pending.get("widget") or {}
            if not body.get("dismissOnMoveOn"):
                raise _error(409, PENDING_ERROR)

        async def events() -> AsyncIterator[bytes]:
            async for event, data in run_user_turn(
                store=store,
                backend=backend,
                conversation=conversation,
                content=payload.content,
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
                dismissed=payload.dismissed,
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
