# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator
from typing import Any, Protocol
from urllib.parse import urlparse

import httpx

BACKEND_MOCK = "mock"
BACKEND_VLLM = "vllm"
BACKEND_OMLX = "omlx"

# First-class local OpenAI-compat (oMLX on Mac). Aliases resolve to omlx.
_OMLX_ALIASES = {"omlx", "openai", "openai-compat", "openai_compat"}
KNOWN_BACKENDS = {BACKEND_MOCK, BACKEND_VLLM, BACKEND_OMLX}

_LOOPBACK_HOSTS = {
    "localhost",
    "127.0.0.1",
    "::1",
    "0:0:0:0:0:0:0:1",
}


class InferenceBackend(Protocol):
    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        ...


FORWARD_RE = re.compile(r"FORWARD:@(\S+)")
MATH_RE = re.compile(r"(\d+)\s*\+\s*(\d+)")


def _parse_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if not stripped.startswith("{"):
        return None
    try:
        value = json.loads(stripped)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def _neutralize_ats(text: str) -> str:
    return re.sub(r"(?<![A-Za-z0-9_])@", "(at)", text)


def _mock_reply(messages: list[dict[str, str]]) -> str:
    last_user = ""
    system = ""
    for item in messages:
        if item.get("role") == "system" and not system:
            system = item.get("content", "")
    for item in reversed(messages):
        if item.get("role") == "user":
            last_user = item.get("content", "")
            break
    pack = _parse_json_object(last_user)
    forwarded = " ".join(f"@{name}" for name in FORWARD_RE.findall(system))
    extra = f"\n\n{forwarded}" if forwarded else ""

    if pack and pack.get("result") is not None and pack.get("from"):
        result = str(pack.get("result") or "").strip() or "(empty)"
        return result

    if pack and pack.get("userAsk") is not None:
        ask = str(pack.get("userAsk") or "")
        math = MATH_RE.search(ask)
        if math:
            return str(int(math.group(1)) + int(math.group(2)))
        snippet = _neutralize_ats(ask.strip().replace("\n", " "))
        if len(snippet) > 280:
            snippet = snippet[:277] + "..."
        return (snippet or "(empty)") + extra

    snippet = last_user.strip().replace("\n", " ")
    if len(snippet) > 280:
        snippet = snippet[:277] + "..."
    snippet = _neutralize_ats(snippet)
    return (
        "Heard. I'm Snorlax, running locally — mock backend, no cloud LLM, "
        "no tools in v0.\n\n"
        f"You said: {snippet or '(empty)'}\n\n"
        "When this Spark is wired to vLLM I'll keep the same SSE contract. "
        "Until then I can still take the brief, remember this transcript, "
        "and wait for the computer, skills, and MCP work."
        f"{extra}"
    )


class MockBackend:
    """Local stand-in so the slice runs without a 70B checkpoint."""

    name = BACKEND_MOCK

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        reply = _mock_reply(messages)
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


def is_loopback_url(url: str) -> bool:
    """True for localhost / 127.0.0.0/8 / ::1 inference URLs."""
    host = (urlparse(url).hostname or "").lower()
    if not host:
        return False
    if host in _LOOPBACK_HOSTS:
        return True
    if host.startswith("127."):
        return True
    return False


def inference_auth_headers(
    *,
    base_url: str,
    api_key: str | None,
    send_auth: bool | None = None,
) -> dict[str, str]:
    """Headers for the model server.

    Local inference (oMLX / vLLM on loopback) does not get a Bearer token by
    default. The LAN token between clients and snorlax-runtime is never the
    model-server key. Set send_auth=True only if a remote OpenAI-compat host
    actually needs one.
    """
    key = (api_key or "").strip()
    if not key:
        return {}
    if send_auth is False:
        return {}
    if send_auth is None and is_loopback_url(base_url):
        return {}
    return {"Authorization": f"Bearer {key}"}


class OpenAICompatBackend:
    """OpenAI-compat streaming client. Clients never call this; FastAPI does."""

    name = "openai-compat"

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        api_key: str | None = None,
        send_auth: bool | None = None,
        label: str = "inference",
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.send_auth = send_auth
        self.label = label
        self._transport = transport

    def request_headers(self) -> dict[str, str]:
        return inference_auth_headers(
            base_url=self.base_url,
            api_key=self.api_key,
            send_auth=self.send_auth,
        )

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict = {"timeout": None}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
        }
        headers = self.request_headers()
        async with self._client() as client:
            try:
                async with client.stream(
                    "POST", url, json=payload, headers=headers
                ) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode("utf-8", "replace")
                        raise InferenceError(
                            "inference_unavailable",
                            f"{self.label} returned {response.status_code}: {body[:400]}",
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data or data == "[DONE]":
                            continue
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        delta = (
                            chunk.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                        if delta:
                            yield delta
            except InferenceError:
                raise
            except httpx.HTTPError as exc:
                raise InferenceError(
                    "inference_unavailable",
                    f"{self.label} is not reachable at {url}: {exc}",
                ) from exc


class VllmBackend(OpenAICompatBackend):
    """Spark vLLM path. Distinct from Mac-local oMLX."""

    name = BACKEND_VLLM

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        api_key: str | None = None,
        send_auth: bool | None = None,
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        super().__init__(
            base_url,
            model,
            api_key=api_key,
            send_auth=send_auth,
            label="vLLM",
            transport=transport,
        )


class OmlxBackend(OpenAICompatBackend):
    """Mac-local oMLX (OpenAI-compat at :8000/v1). Distinct from Spark vLLM."""

    name = BACKEND_OMLX

    def __init__(
        self,
        base_url: str,
        model: str,
        *,
        api_key: str | None = None,
        send_auth: bool | None = None,
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        super().__init__(
            base_url,
            model,
            api_key=api_key,
            send_auth=send_auth,
            label="oMLX",
            transport=transport,
        )


class InferenceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def normalize_backend_name(name: str) -> str:
    resolved = name.strip().lower()
    if resolved in _OMLX_ALIASES:
        return BACKEND_OMLX
    return resolved


def build_backend(
    name: str,
    *,
    vllm_base_url: str,
    model: str,
    omlx_base_url: str | None = None,
    api_key: str | None = None,
    send_auth: bool | None = None,
    transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
) -> InferenceBackend:
    resolved = normalize_backend_name(name)
    if resolved == BACKEND_VLLM:
        return VllmBackend(
            vllm_base_url,
            model,
            api_key=api_key,
            send_auth=send_auth,
            transport=transport,
        )
    if resolved == BACKEND_OMLX:
        return OmlxBackend(
            omlx_base_url or vllm_base_url,
            model,
            api_key=api_key,
            send_auth=send_auth,
            transport=transport,
        )
    if resolved == BACKEND_MOCK:
        return MockBackend()
    raise ValueError(
        "SNORLAX_INFERENCE_BACKEND must be 'mock', 'omlx', or 'vllm', "
        f"got {name!r}"
    )
