# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from snorlax_runtime import SEEDED_AGENT_ID
from snorlax_runtime.auth import require_bearer
from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store, dump_json, new_id
from snorlax_runtime.inference import InferenceError, build_backend
from snorlax_runtime.schemas import (
    Agent,
    AgentCreate,
    AgentList,
    AgentPatch,
    ErrorBody,
    ErrorModel,
    MessageCreate,
    MessageList,
    ProcessHealth,
    RuntimeHealth,
)


def _error(status_code: int, code: str, message: str) -> HTTPException:
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        store = Store(settings.data_dir)
        await store.connect()
        token = settings.token or await store.get_setting("auth_token")
        if not token:
            token = secrets.token_urlsafe(32)
        settings.token = token
        await store.set_setting("auth_token", token)
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
            f"  bind: {settings.bind or '(set by process)'}:{settings.port}\n"
            f"  backend: {settings.resolved_backend()}\n"
            f"  model: {settings.model}\n"
            f"  token: {token}",
            flush=True,
        )
        yield
        await store.close()

    app = FastAPI(
        title="Snorlax-Bot Runtime",
        version="0.1.0",
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
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            body = {"error": exc.detail}
        else:
            body = {
                "error": {"code": "http_error", "message": str(exc.detail)}
            }
        return JSONResponse(status_code=exc.status_code, content=body)

    @app.exception_handler(RequestValidationError)
    async def validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=jsonable_encoder(
                ErrorBody(
                    error=ErrorModel(
                        code="invalid_request",
                        message=str(exc.errors()[0]["msg"])
                        if exc.errors()
                        else "Invalid request",
                    )
                )
            ),
        )

    @app.get("/health", response_model=ProcessHealth)
    async def process_health() -> ProcessHealth:
        return ProcessHealth()

    @app.get("/v1/health", response_model=RuntimeHealth)
    async def runtime_health(
        request: Request, _: str = Depends(require_bearer)
    ) -> RuntimeHealth:
        cfg: Settings = request.app.state.settings
        return RuntimeHealth(
            model=cfg.model,
            inference_backend=cfg.resolved_backend(),
            seeded_agent_id=SEEDED_AGENT_ID,
            bind_host=cfg.bind or "unknown",
        )

    @app.get("/v1/agents", response_model=AgentList)
    async def list_agents(
        request: Request, _: str = Depends(require_bearer)
    ) -> AgentList:
        store: Store = request.app.state.store
        rows = await store.list_agents()
        return AgentList(agents=[Agent.model_validate(r) for r in rows])

    @app.post(
        "/v1/agents",
        response_model=Agent,
        status_code=status.HTTP_201_CREATED,
    )
    async def create_agent(
        payload: AgentCreate,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Agent:
        store: Store = request.app.state.store
        row = await store.create_agent(payload.name, payload.instructions)
        return Agent.model_validate(row)

    @app.get("/v1/agents/{agent_id}", response_model=Agent)
    async def get_agent(
        agent_id: str, request: Request, _: str = Depends(require_bearer)
    ) -> Agent:
        store: Store = request.app.state.store
        row = await store.get_agent(agent_id)
        if row is None:
            raise _error(404, "not_found", f"Agent {agent_id!r} not found")
        return Agent.model_validate(row)

    @app.patch("/v1/agents/{agent_id}", response_model=Agent)
    async def patch_agent(
        agent_id: str,
        payload: AgentPatch,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> Agent:
        store: Store = request.app.state.store
        row = await store.patch_agent(
            agent_id, name=payload.name, instructions=payload.instructions
        )
        if row is None:
            raise _error(404, "not_found", f"Agent {agent_id!r} not found")
        return Agent.model_validate(row)

    @app.delete("/v1/agents/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
    async def delete_agent(
        agent_id: str, request: Request, _: str = Depends(require_bearer)
    ) -> None:
        if agent_id == SEEDED_AGENT_ID:
            raise _error(
                409,
                "seeded_agent",
                "The seeded agent 'snorlax-bot' cannot be deleted",
            )
        store: Store = request.app.state.store
        deleted = await store.delete_agent(agent_id)
        if not deleted:
            raise _error(404, "not_found", f"Agent {agent_id!r} not found")

    @app.get("/v1/agents/{agent_id}/messages", response_model=MessageList)
    async def list_messages(
        agent_id: str,
        request: Request,
        _: str = Depends(require_bearer),
        limit: int = Query(default=100, ge=1, le=200),
        before: str | None = None,
    ) -> MessageList:
        store: Store = request.app.state.store
        if await store.get_agent(agent_id) is None:
            raise _error(404, "not_found", f"Agent {agent_id!r} not found")
        rows, cursor = await store.list_messages(
            agent_id, limit=limit, before=before
        )
        return MessageList.model_validate({"messages": rows, "next_cursor": cursor})

    @app.post("/v1/agents/{agent_id}/messages")
    async def post_message(
        agent_id: str,
        payload: MessageCreate,
        request: Request,
        _: str = Depends(require_bearer),
    ) -> StreamingResponse:
        store: Store = request.app.state.store
        if await store.get_agent(agent_id) is None:
            raise _error(404, "not_found", f"Agent {agent_id!r} not found")
        atts = [a.model_dump() for a in payload.attachments]
        await store.add_message(
            agent_id=agent_id,
            role="user",
            content=payload.content,
            attachments=atts,
        )
        assistant_id = new_id("msg")
        backend = request.app.state.backend
        transcript = await store.inference_transcript(agent_id)

        async def events() -> AsyncIterator[bytes]:
            pieces: list[str] = []
            try:
                async for delta in backend.stream(transcript):
                    pieces.append(delta)
                    yield _sse(
                        "message.delta",
                        {"message_id": assistant_id, "delta": delta},
                    )
            except InferenceError as exc:
                yield _sse(
                    "error",
                    {"error": {"code": exc.code, "message": exc.message}},
                )
                return
            saved = await store.add_message(
                agent_id=agent_id,
                role="assistant",
                content="".join(pieces),
                message_id=assistant_id,
            )
            yield _sse("message.done", {"message": saved})

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    return app


def _sse(event: str, data: dict) -> bytes:
    payload = dump_json(data)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")
