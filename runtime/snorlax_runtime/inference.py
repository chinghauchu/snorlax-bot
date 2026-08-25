# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping
from typing import Any, Protocol

import httpx

DEFAULT_CONNECT_TIMEOUT = 10.0
DEFAULT_READ_TIMEOUT = 120.0
DEFAULT_WRITE_TIMEOUT = 30.0


class InferenceBackend(Protocol):
    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        ...


class InferenceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _unavailable(detail: str) -> InferenceError:
    return InferenceError("inference_unavailable", f"inference_unavailable: {detail}")


class MockBackend:
    """Local stand-in so the slice runs without a 70B checkpoint."""

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        last_user = ""
        for item in reversed(messages):
            if item.get("role") == "user":
                last_user = item.get("content", "")
                break
        snippet = last_user.strip().replace("\n", " ")
        if len(snippet) > 280:
            snippet = snippet[:277] + "..."
        reply = (
            "Heard. I'm Snorlax, running locally — mock backend, no cloud LLM, "
            "no tools in v0.\n\n"
            f"You said: {snippet or '(empty)'}\n\n"
            "When this Spark is wired to vLLM I'll keep the same SSE contract. "
            "Until then I can still take the brief, remember this transcript, "
            "and wait for the computer, skills, and MCP work."
        )
        for token in _tokenize(reply):
            yield token


def _tokenize(text: str) -> list[str]:
    tokens: list[str] = []
    word = ""
    for ch in text:
        word += ch
        if ch in " \n":
            tokens.append(word)
            word = ""
    if word:
        tokens.append(word)
    return tokens


def text_only_messages(messages: list[Mapping[str, Any]]) -> list[dict[str, str]]:
    """OpenAI-compat chat messages with role/content strings only. No images."""
    cleaned: list[dict[str, str]] = []
    for item in messages:
        role = str(item.get("role") or "user")
        cleaned.append({"role": role, "content": _text_content(item.get("content"))})
    return cleaned


def _text_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
            elif isinstance(part, Mapping):
                if part.get("type") == "text" or "text" in part:
                    parts.append(str(part.get("text") or ""))
        return "".join(parts)
    return str(content)


class VllmBackend:
    """OpenAI-compat streaming client for a local vLLM server.

    Clients never call this. FastAPI owns transcripts and maps failures to an
    SSE ``error`` event whose body is ``{ "error": "<string>" }``.
    """

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        connect_timeout: float = DEFAULT_CONNECT_TIMEOUT,
        read_timeout: float = DEFAULT_READ_TIMEOUT,
        write_timeout: float = DEFAULT_WRITE_TIMEOUT,
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = httpx.Timeout(
            connect=connect_timeout,
            read=read_timeout,
            write=write_timeout,
            pool=connect_timeout,
        )
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {"timeout": self.timeout}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": text_only_messages(messages),
            "stream": True,
            "temperature": 0.7,
        }
        try:
            async with self._client() as client:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode("utf-8", "replace")
                        raise _unavailable(
                            f"vLLM returned {response.status_code}: {body[:400]}"
                        )
                    async for line in response.aiter_lines():
                        token = _delta_from_sse_line(line)
                        if token:
                            yield token
        except InferenceError:
            raise
        except httpx.ConnectError as exc:
            raise _unavailable(
                f"vLLM is not reachable at {url}. Is vLLM running? {exc}"
            ) from exc
        except httpx.TimeoutException as exc:
            raise _unavailable(f"vLLM timed out at {url}: {exc}") from exc
        except httpx.HTTPError as exc:
            raise _unavailable(f"vLLM request failed at {url}: {exc}") from exc


def _delta_from_sse_line(line: str) -> str | None:
    if not line.startswith("data:"):
        return None
    data = line[5:].strip()
    if not data or data == "[DONE]":
        return None
    try:
        chunk = json.loads(data)
    except json.JSONDecodeError:
        return None
    if not isinstance(chunk, dict):
        return None
    err = chunk.get("error")
    if err:
        detail = err if isinstance(err, str) else json.dumps(err, ensure_ascii=False)
        raise _unavailable(f"vLLM stream error: {detail[:400]}")
    choices = chunk.get("choices") or []
    if not choices:
        return None
    delta = (choices[0] or {}).get("delta") or {}
    content = delta.get("content")
    return content if isinstance(content, str) and content else None


def build_backend(
    name: str,
    *,
    vllm_base_url: str,
    model: str,
    connect_timeout: float = DEFAULT_CONNECT_TIMEOUT,
    read_timeout: float = DEFAULT_READ_TIMEOUT,
    write_timeout: float = DEFAULT_WRITE_TIMEOUT,
    transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
) -> InferenceBackend:
    if name == "vllm":
        return VllmBackend(
            vllm_base_url,
            model,
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            write_timeout=write_timeout,
            transport=transport,
        )
    return MockBackend()
