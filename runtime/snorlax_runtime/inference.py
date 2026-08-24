# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Protocol

import httpx


class InferenceBackend(Protocol):
    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        ...


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


class VllmBackend:
    def __init__(self, base_url: str, model: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def stream(self, messages: list[dict[str, str]]) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.7,
        }
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code >= 400:
                        body = (await response.aread()).decode("utf-8", "replace")
                        raise InferenceError(
                            "inference_unavailable",
                            f"vLLM returned {response.status_code}: {body[:400]}",
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
            except httpx.HTTPError as exc:
                raise InferenceError(
                    "inference_unavailable",
                    f"vLLM is not reachable at {url}: {exc}",
                ) from exc


class InferenceError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def build_backend(name: str, *, vllm_base_url: str, model: str) -> InferenceBackend:
    if name == "vllm":
        return VllmBackend(vllm_base_url, model)
    return MockBackend()
