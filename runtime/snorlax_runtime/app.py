# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Body, Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, StreamingResponse

from snorlax_runtime import SEEDED_AGENT_ID, SEEDED_CHANNEL_ID, __version__
from snorlax_runtime.auth import require_bearer
from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store, dump_json
from snorlax_runtime.inference import build_backend
from snorlax_runtime.routing import MentionError, resolve_user_mentions, run_user_turn
from snorlax_runtime.schemas import Agent, AgentCreate, AgentPatch, Health, Message, MessageCreate
from snorlax_runtime.token import resolve_token, write_token_file


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
        app.state.backend = build_backend(
            settings.resolved_backend(),
            vllm_base_url=settings.vllm_base_url,
            model=settings.model,
        )
        print(
            "Snorlax-Bot runtime ready\n"
            f"  data: {settings.data_dir}\n"
            f"  db: {settings.data_dir / 'snorlax.db'}\n"
            f"  token file: {settings.data_dir / 'token'}\n"
            f"  bind: {settings.bind or '(set by process)'}:{settings.port}\n"
            f"  backend: {settings.resolved_backend()}\n"
            f"  model: {settings.model}\n"
            f"  token: {token}",
            flush=True,
        )
        yield
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
        fields = payload.model_dump(exclude_unset=True)
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
        if id == SEEDED_AGENT_ID:
            raise _error(409, "seeded agent cannot be deleted")
        if id == SEEDED_CHANNEL_ID:
            raise _error(409, "seeded channel cannot be deleted")
        store: Store = request.app.state.store
        deleted = await store.delete_agent(id)
        if not deleted:
            raise _error(404, f"Agent {id!r} not found")

    @app.get("/v1/agents/{id}/messages", response_model=list[Message])
    async def list_messages(
        id: str,
        request: Request,
        _: str = Depends(require_bearer),
        limit: int = Query(default=100, ge=1, le=200),
        before: str | None = None,
    ) -> list[Message]:
        store: Store = request.app.state.store
        if await store.get_agent(id) is None:
            raise _error(404, f"Agent {id!r} not found")
        rows = await store.list_messages(id, limit=limit, before=before)
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

        async def events() -> AsyncIterator[bytes]:
            async for event, data in run_user_turn(
                store=store,
                backend=backend,
                conversation=conversation,
                content=payload.content,
                images=images,
                mentions=mentions,
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
