# SPDX-License-Identifier: Apache-2.0
"""Per-agent model providers.

The process backend (mock / oMLX / vLLM from the environment) stays the
fallback when nobody has saved a default and the agent says Use default.
A saved default or an agent override builds a provider adapter. Cloud
keys live in `{data_dir}/secrets/provider-keys.json` mode 0600. They are
never logged and never returned in full.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

from snorlax_runtime.config import Settings
from snorlax_runtime.inference import (
    InferenceBackend,
    InferenceError,
    OmlxBackend,
    OpenAICompatBackend,
    StreamPart,
    ToolCall,
    VllmBackend,
    auth_rejected,
    redact_secret,
)

PROVIDER_OMLX = "omlx"
PROVIDER_VLLM = "vllm"
PROVIDER_OPENAI = "openai"
PROVIDER_ANTHROPIC = "anthropic"
PROVIDER_GEMINI = "gemini"
PROVIDER_GROK = "grok"

PROVIDERS: tuple[str, ...] = (
    PROVIDER_OMLX,
    PROVIDER_VLLM,
    PROVIDER_OPENAI,
    PROVIDER_ANTHROPIC,
    PROVIDER_GEMINI,
    PROVIDER_GROK,
)
KEY_PROVIDERS: tuple[str, ...] = (
    PROVIDER_OPENAI,
    PROVIDER_ANTHROPIC,
    PROVIDER_GEMINI,
    PROVIDER_GROK,
)
LOCAL_PROVIDERS: tuple[str, ...] = (PROVIDER_OMLX, PROVIDER_VLLM)

PROVIDER_LABELS: dict[str, str] = {
    PROVIDER_OMLX: "Local (oMLX)",
    PROVIDER_VLLM: "Spark (vLLM)",
    PROVIDER_OPENAI: "OpenAI",
    PROVIDER_ANTHROPIC: "Anthropic",
    PROVIDER_GEMINI: "Google Gemini",
    PROVIDER_GROK: "xAI Grok",
}

OPENAI_BASE = "https://api.openai.com/v1"
GROK_BASE = "https://api.x.ai/v1"
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

MODEL_FILE = "model.json"
SECRETS_DIR = "secrets"
SECRETS_FILE = "provider-keys.json"
MODEL_ID_MAX = 200


class ProviderKeyError(InferenceError):
    """Missing or rejected provider key. The turn persists this as a reply."""

    def __init__(self, reason: str, message: str, provider: str) -> None:
        super().__init__("provider_key", message)
        self.reason = reason
        self.provider = provider


def missing_key_message(provider: str) -> str:
    label = PROVIDER_LABELS.get(provider, provider)
    return f"Add a {label} API key in Settings."


def invalid_key_message(provider: str) -> str:
    label = PROVIDER_LABELS.get(provider, provider)
    return f"{label} rejected that API key. Check it in Settings."


def missing_key_error(provider: str) -> ProviderKeyError:
    return ProviderKeyError("missing_key", missing_key_message(provider), provider)


def invalid_key_error(provider: str) -> ProviderKeyError:
    return ProviderKeyError("invalid_key", invalid_key_message(provider), provider)


def known_provider(value: str) -> str:
    provider = (value or "").strip().lower()
    if provider not in PROVIDERS:
        raise ValueError(
            "provider must be omlx, vllm, openai, anthropic, gemini, or grok"
        )
    return provider


def clean_model_id(value: str) -> str:
    text = (value or "").strip()
    if not text:
        raise ValueError("model id must not be empty")
    if len(text) > MODEL_ID_MAX:
        raise ValueError(f"model id must be at most {MODEL_ID_MAX} characters")
    return text


def mask_secret(value: str) -> str:
    text = (value or "").strip()
    if not text:
        return ""
    if len(text) <= 8:
        return "••••"
    return f"{text[:3]}…{text[-4:]}"


def _chmod(path: Path, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        return


def secrets_path(data_dir: Path) -> Path:
    return data_dir / SECRETS_DIR / SECRETS_FILE


def model_path(data_dir: Path) -> Path:
    return data_dir / MODEL_FILE


def read_secrets(data_dir: Path) -> dict[str, str]:
    path = secrets_path(data_dir)
    if not path.is_file():
        return {}
    _chmod(path, 0o600)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(raw, dict):
        return {}
    out: dict[str, str] = {}
    for key, value in raw.items():
        if key in KEY_PROVIDERS and isinstance(value, str) and value.strip():
            out[key] = value.strip()
    return out


def write_secrets(data_dir: Path, secrets: dict[str, str]) -> None:
    path = secrets_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    _chmod(path.parent, 0o700)
    stored = {
        key: value
        for key, value in secrets.items()
        if key in KEY_PROVIDERS and isinstance(value, str) and value.strip()
    }
    payload = json.dumps(stored, indent=2) + "\n"
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(payload, encoding="utf-8")
    _chmod(tmp, 0o600)
    os.replace(tmp, path)
    _chmod(path, 0o600)


def get_key(data_dir: Path, provider: str) -> str | None:
    if provider not in KEY_PROVIDERS:
        return None
    return read_secrets(data_dir).get(provider)


def set_key(data_dir: Path, provider: str, api_key: str) -> str:
    if provider not in KEY_PROVIDERS:
        raise ValueError("that provider does not take an API key")
    secret = (api_key or "").strip()
    if not secret:
        raise ValueError("apiKey must not be empty")
    current = read_secrets(data_dir)
    current[provider] = secret
    write_secrets(data_dir, current)
    return mask_secret(secret)


def delete_key(data_dir: Path, provider: str) -> None:
    if provider not in KEY_PROVIDERS:
        raise ValueError("that provider does not take an API key")
    current = read_secrets(data_dir)
    current.pop(provider, None)
    if current:
        write_secrets(data_dir, current)
    else:
        path = secrets_path(data_dir)
        if path.is_file():
            path.unlink()


def key_statuses(data_dir: Path) -> list[dict[str, Any]]:
    secrets = read_secrets(data_dir)
    rows: list[dict[str, Any]] = []
    for provider in KEY_PROVIDERS:
        secret = secrets.get(provider)
        rows.append(
            {
                "provider": provider,
                "configured": bool(secret),
                "masked": mask_secret(secret) if secret else None,
            }
        )
    return rows


def read_saved_default(data_dir: Path) -> tuple[str, str] | None:
    path = model_path(data_dir)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(raw, dict):
        return None
    try:
        return known_provider(str(raw.get("provider") or "")), clean_model_id(
            str(raw.get("model") or "")
        )
    except ValueError:
        return None


def write_saved_default(data_dir: Path, provider: str, model: str) -> tuple[str, str]:
    choice = (known_provider(provider), clean_model_id(model))
    path = model_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps({"provider": choice[0], "model": choice[1]}) + "\n"
    path.write_text(payload, encoding="utf-8")
    return choice


def env_default(settings: Settings) -> tuple[str, str]:
    """What Settings shows before anyone saves a default.

    mock and omlx both display as the local oMLX model. Saving is what
    switches a mock process onto a real adapter.
    """
    provider = (
        PROVIDER_VLLM if settings.resolved_backend() == "vllm" else PROVIDER_OMLX
    )
    return provider, settings.model


class ModelDirectory:
    """Resolve Use default vs an agent override for one process."""

    def __init__(
        self,
        settings: Settings,
        fallback: InferenceBackend | Any,
    ) -> None:
        self.settings = settings
        self._fallback = fallback
        self.transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None

    @property
    def fallback(self) -> InferenceBackend:
        current = self._fallback() if callable(self._fallback) else self._fallback
        return current

    def display_default(self) -> tuple[str, str]:
        saved = read_saved_default(self.settings.data_dir)
        if saved is not None:
            return saved
        return env_default(self.settings)

    def selection_for(self, agent: dict[str, Any]) -> tuple[str, str] | None:
        raw = agent.get("model")
        if isinstance(raw, dict) and raw.get("provider") and raw.get("id"):
            return known_provider(str(raw["provider"])), clean_model_id(str(raw["id"]))
        return read_saved_default(self.settings.data_dir)

    def label_for(self, agent: dict[str, Any]) -> str:
        selected = self.selection_for(agent)
        if selected is None:
            return self.settings.model
        return selected[1]

    def backend_for(self, agent: dict[str, Any]) -> InferenceBackend:
        selected = self.selection_for(agent)
        if selected is None:
            return self.fallback
        provider, model_id = selected
        return build_provider(
            provider,
            model_id,
            settings=self.settings,
            transport=self.transport,
        )


def build_provider(
    provider: str,
    model: str,
    *,
    settings: Settings,
    transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
) -> InferenceBackend:
    name = known_provider(provider)
    model_id = clean_model_id(model)
    data_dir = settings.data_dir
    if name == PROVIDER_OMLX:
        return OmlxBackend(
            settings.omlx_base_url,
            model_id,
            transport=transport,
        )
    if name == PROVIDER_VLLM:
        return VllmBackend(
            settings.vllm_base_url,
            model_id,
            transport=transport,
        )
    if name == PROVIDER_OPENAI:
        return OpenAICompatBackend(
            OPENAI_BASE,
            model_id,
            api_key=get_key(data_dir, name),
            send_auth=True,
            label="OpenAI",
            transport=transport,
            key_provider=name,
        )
    if name == PROVIDER_GROK:
        return OpenAICompatBackend(
            GROK_BASE,
            model_id,
            api_key=get_key(data_dir, name),
            send_auth=True,
            label="xAI Grok",
            transport=transport,
            key_provider=name,
        )
    if name == PROVIDER_ANTHROPIC:
        return AnthropicBackend(
            model_id,
            api_key=get_key(data_dir, name),
            transport=transport,
        )
    if name == PROVIDER_GEMINI:
        return GeminiBackend(
            model_id,
            api_key=get_key(data_dir, name),
            transport=transport,
        )
    raise ValueError(f"unknown provider {provider!r}")


def _text_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text") or item.get("content")
                if text:
                    parts.append(str(text))
        return "\n".join(parts)
    return str(content)


def _parse_args(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    try:
        value = json.loads(raw) if str(raw or "").strip() else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


class _NativeBackend:
    name = "native"
    key_provider = ""

    def __init__(
        self,
        model: str,
        *,
        api_key: str | None,
        transport: httpx.AsyncBaseTransport | httpx.BaseTransport | None = None,
    ) -> None:
        self.model = model
        self.api_key = (api_key or "").strip() or None
        self._transport = transport

    def _client(self) -> httpx.AsyncClient:
        kwargs: dict[str, Any] = {"timeout": None}
        if self._transport is not None:
            kwargs["transport"] = self._transport
        return httpx.AsyncClient(**kwargs)

    def _require_key(self) -> str:
        if not self.api_key:
            raise missing_key_error(self.key_provider)
        return self.api_key

    async def stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ):
        async for part in self.generate(messages, tools=tools):
            if part.text:
                yield part.text

    async def generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ):
        raise NotImplementedError


def _openai_tools_as_anthropic(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for tool in tools or []:
        if not isinstance(tool, dict):
            continue
        fn = tool.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        schema = fn.get("parameters") or {"type": "object", "properties": {}}
        out.append(
            {
                "name": name,
                "description": fn.get("description") or "",
                "input_schema": schema,
            }
        )
    return out


def anthropic_payload(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
    model: str,
) -> dict[str, Any]:
    system_parts: list[str] = []
    converted: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []

    def flush() -> None:
        nonlocal pending
        if pending:
            converted.append({"role": "user", "content": pending})
            pending = []

    for message in messages:
        role = message.get("role")
        if role == "system":
            text = _text_content(message.get("content")).strip()
            if text:
                system_parts.append(text)
            continue
        if role == "tool":
            pending.append(
                {
                    "type": "tool_result",
                    "tool_use_id": str(message.get("tool_call_id") or ""),
                    "content": _text_content(message.get("content")),
                }
            )
            continue
        flush()
        if role == "assistant":
            blocks: list[dict[str, Any]] = []
            text = _text_content(message.get("content")).strip()
            if text:
                blocks.append({"type": "text", "text": text})
            for call in message.get("tool_calls") or []:
                if not isinstance(call, dict):
                    continue
                fn = call.get("function") or {}
                blocks.append(
                    {
                        "type": "tool_use",
                        "id": str(call.get("id") or "call"),
                        "name": str(fn.get("name") or ""),
                        "input": _parse_args(fn.get("arguments")),
                    }
                )
            if not blocks:
                blocks.append({"type": "text", "text": ""})
            converted.append({"role": "assistant", "content": blocks})
            continue
        converted.append(
            {"role": "user", "content": _text_content(message.get("content"))}
        )
    flush()
    if not converted or converted[0]["role"] != "user":
        converted.insert(0, {"role": "user", "content": ""})
    payload: dict[str, Any] = {
        "model": model,
        "max_tokens": 4096,
        "stream": True,
        "messages": converted,
    }
    if system_parts:
        payload["system"] = "\n\n".join(system_parts)
    anthropic_tools = _openai_tools_as_anthropic(tools)
    if anthropic_tools:
        payload["tools"] = anthropic_tools
    return payload


class AnthropicBackend(_NativeBackend):
    name = PROVIDER_ANTHROPIC
    key_provider = PROVIDER_ANTHROPIC

    async def generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ):
        key = self._require_key()
        payload = anthropic_payload(messages, tools, self.model)
        headers = {
            "x-api-key": key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }
        blocks: dict[int, dict[str, str]] = {}
        async with self._client() as client:
            try:
                async with client.stream(
                    "POST", ANTHROPIC_URL, json=payload, headers=headers
                ) as response:
                    if response.status_code >= 400:
                        body = redact_secret(
                            (await response.aread()).decode("utf-8", "replace"),
                            key,
                        )
                        if auth_rejected(response.status_code, body):
                            raise invalid_key_error(self.key_provider)
                        raise InferenceError(
                            "inference_unavailable",
                            f"Anthropic returned {response.status_code}: {body[:400]}",
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        kind = event.get("type")
                        if kind == "content_block_start":
                            block = event.get("content_block") or {}
                            if block.get("type") == "tool_use":
                                idx = int(event.get("index") or 0)
                                blocks[idx] = {
                                    "id": str(block.get("id") or f"call_{idx}"),
                                    "name": str(block.get("name") or ""),
                                    "arguments": "",
                                }
                        elif kind == "content_block_delta":
                            delta = event.get("delta") or {}
                            if delta.get("type") == "text_delta" and delta.get("text"):
                                yield StreamPart(text=str(delta["text"]))
                            elif delta.get("type") == "input_json_delta":
                                idx = int(event.get("index") or 0)
                                slot = blocks.setdefault(
                                    idx, {"id": f"call_{idx}", "name": "", "arguments": ""}
                                )
                                slot["arguments"] += str(delta.get("partial_json") or "")
            except InferenceError:
                raise
            except httpx.HTTPError as exc:
                raise InferenceError(
                    "inference_unavailable",
                    f"Anthropic is not reachable: {exc}",
                ) from exc
        calls = [
            ToolCall(
                id=slot["id"],
                name=slot["name"],
                arguments=slot["arguments"] or "{}",
            )
            for _, slot in sorted(blocks.items())
            if slot["name"]
        ]
        if calls:
            yield StreamPart(tool_calls=calls)


def _openai_tools_as_gemini(tools: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    decls: list[dict[str, Any]] = []
    for tool in tools or []:
        if not isinstance(tool, dict):
            continue
        fn = tool.get("function") or {}
        name = fn.get("name")
        if not name:
            continue
        decls.append(
            {
                "name": name,
                "description": fn.get("description") or "",
                "parameters": fn.get("parameters")
                or {"type": "object", "properties": {}},
            }
        )
    return [{"functionDeclarations": decls}] if decls else []


def gemini_payload(
    messages: list[dict[str, Any]],
    tools: list[dict[str, Any]] | None,
) -> dict[str, Any]:
    system_parts: list[str] = []
    contents: list[dict[str, Any]] = []
    for message in messages:
        role = message.get("role")
        if role == "system":
            text = _text_content(message.get("content")).strip()
            if text:
                system_parts.append(text)
            continue
        if role == "tool":
            name = str(message.get("name") or "tool")
            contents.append(
                {
                    "role": "user",
                    "parts": [
                        {
                            "functionResponse": {
                                "name": name,
                                "response": {
                                    "result": _text_content(message.get("content"))
                                },
                            }
                        }
                    ],
                }
            )
            continue
        if role == "assistant":
            parts: list[dict[str, Any]] = []
            text = _text_content(message.get("content")).strip()
            if text:
                parts.append({"text": text})
            for call in message.get("tool_calls") or []:
                if not isinstance(call, dict):
                    continue
                fn = call.get("function") or {}
                if not fn.get("name"):
                    continue
                parts.append(
                    {
                        "functionCall": {
                            "name": str(fn.get("name")),
                            "args": _parse_args(fn.get("arguments")),
                        }
                    }
                )
            if parts:
                contents.append({"role": "model", "parts": parts})
            continue
        contents.append(
            {
                "role": "user",
                "parts": [{"text": _text_content(message.get("content"))}],
            }
        )
    if not contents:
        contents.append({"role": "user", "parts": [{"text": ""}]})
    payload: dict[str, Any] = {"contents": contents}
    if system_parts:
        payload["systemInstruction"] = {
            "parts": [{"text": "\n\n".join(system_parts)}]
        }
    gemini_tools = _openai_tools_as_gemini(tools)
    if gemini_tools:
        payload["tools"] = gemini_tools
    return payload


class GeminiBackend(_NativeBackend):
    name = PROVIDER_GEMINI
    key_provider = PROVIDER_GEMINI

    async def generate(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
    ):
        key = self._require_key()
        model = quote(self.model, safe="")
        url = f"{GEMINI_BASE}/models/{model}:streamGenerateContent?alt=sse"
        headers = {"x-goog-api-key": key, "content-type": "application/json"}
        payload = gemini_payload(messages, tools)
        calls: list[ToolCall] = []
        async with self._client() as client:
            try:
                async with client.stream(
                    "POST", url, json=payload, headers=headers
                ) as response:
                    if response.status_code >= 400:
                        body = redact_secret(
                            (await response.aread()).decode("utf-8", "replace"),
                            key,
                        )
                        if auth_rejected(response.status_code, body):
                            raise invalid_key_error(self.key_provider)
                        raise InferenceError(
                            "inference_unavailable",
                            f"Gemini returned {response.status_code}: {body[:400]}",
                        )
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        candidates = event.get("candidates") or []
                        content = (candidates[0].get("content") if candidates else {}) or {}
                        for part in content.get("parts") or []:
                            if not isinstance(part, dict):
                                continue
                            if part.get("text"):
                                yield StreamPart(text=str(part["text"]))
                            call = part.get("functionCall")
                            if isinstance(call, dict) and call.get("name"):
                                calls.append(
                                    ToolCall(
                                        id=f"call_{len(calls)}",
                                        name=str(call["name"]),
                                        arguments=json.dumps(call.get("args") or {}),
                                    )
                                )
            except InferenceError:
                raise
            except httpx.HTTPError as exc:
                raise InferenceError(
                    "inference_unavailable",
                    f"Gemini is not reachable: {exc}",
                ) from exc
        if calls:
            yield StreamPart(tool_calls=calls)


_KEY_IN_LOG = re.compile(r"(sk-|xai-|AIza)[A-Za-z0-9_\-]{8,}")


def assert_no_secret(text: str) -> None:
    """Test helper: a log line or response must not carry a raw key shape."""
    if _KEY_IN_LOG.search(text or ""):
        raise AssertionError("secret leaked")
