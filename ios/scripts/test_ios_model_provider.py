#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.98 per-agent model provider.

A global Default model plus an optional per-agent override. Cloud API
keys stay on the runtime (secrets file mode 0600). The API returns a
mask. A missing or invalid key is an inline reply with a Settings
link. OpenAPI is 0.19.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SETTINGS = (IOS / "SettingsSheet.swift").read_text(encoding="utf-8")
PROFILE = (IOS / "ProfileSheet.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
HELPER = (IOS / "ModelProvider.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "modelProvider.ts").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
API = (ROOT / "desktop" / "src" / "api.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PKG = (ROOT / "desktop" / "package.json").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = (
    "v0.98 per-agent model provider (global Default model is a provider plus a "
    "free-text model id and stays the current local model until changed; each "
    "agent info pane Model field is Use default or a specific provider and model "
    "id; providers are Local (oMLX), Spark (vLLM), OpenAI, Anthropic, Google "
    "Gemini, and xAI Grok; API keys are entered in Settings and stored only in "
    "the runtime secrets file mode 0600, masked by the API, never logged; the "
    "model name shows subtly on each assistant bubble; a handoff runs the other "
    "agent on that agent's model; a missing or invalid key is an inline reply "
    "with a Settings link and does not crash; OpenAPI 0.19.0)"
)

PROVIDERS = ("omlx", "vllm", "openai", "anthropic", "gemini", "grok")
LABELS = {
    "omlx": "Local (oMLX)",
    "vllm": "Spark (vLLM)",
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "gemini": "Google Gemini",
    "grok": "xAI Grok",
}


def choice(provider: str, model_id: str):
    trimmed = model_id.strip()
    if not provider or provider == "default" or provider not in PROVIDERS or not trimmed:
        return None
    return {"provider": provider, "id": trimmed}


def summary(model) -> str:
    if not model or not str(model.get("id", "")).strip():
        return "Use default"
    return f"{LABELS[model['provider']]} · {model['id'].strip()}"


def bubble(model: str | None) -> str | None:
    text = (model or "").strip()
    return text or None


def is_key_error(code: str | None) -> bool:
    return code in {"missing_key", "invalid_key"}


def error_copy(content: str) -> tuple[str, str]:
    import re

    stripped = re.sub(r"\s*Settings\.?\s*$", "", content).strip()
    return (stripped or content, "Settings")


def main() -> None:
    assert choice("", "gpt-4o") is None
    assert choice("default", "gpt-4o") is None
    assert choice("openai", "  ") is None
    assert choice("nope", "gpt-4o") is None
    assert choice("openai", " gpt-4o ") == {"provider": "openai", "id": "gpt-4o"}
    assert summary(None) == "Use default"
    assert summary({"provider": "anthropic", "id": "claude"}) == "Anthropic · claude"
    assert bubble(None) is None
    assert bubble("  ") is None
    assert bubble("gpt-4o") == "gpt-4o"
    assert is_key_error("missing_key")
    assert is_key_error("invalid_key")
    assert not is_key_error(None)
    assert error_copy("Add an OpenAI API key in Settings.") == (
        "Add an OpenAI API key in",
        "Settings",
    )

    for doc in (OPENAPI, RUNTIME_OPENAPI, DESKTOP_OPENAPI):
        assert "version: 0.19.0" in doc
        assert "/v1/settings/model" in doc
        assert "/v1/settings/keys" in doc
        assert "Use default" in doc
        assert "missing_key" in doc
        assert "0600" in doc

    assert "Local (oMLX)" in HELPER
    assert "xAI Grok" in HELPER
    assert "encodeNil(forKey: .model)" in HELPER
    assert "snorlax.providerKeys" not in HELPER
    assert "UserDefaults" not in HELPER
    assert "Use default" in PROFILE
    assert "Model id" in PROFILE
    assert "ModelProvider.summary" in PROFILE
    assert "patchAgentProfile" in MODEL
    assert "Enter a model id." in MODEL
    assert "getModelDefault" in CLIENT
    assert "putProviderKey" in CLIENT
    assert "deleteProviderKey" in CLIENT
    assert "v1/settings/model" in CLIENT
    assert "v1/settings/keys" in CLIENT
    assert "Default model" in SETTINGS
    assert "Save default" in SETTINGS
    assert "API key" in SETTINGS
    assert "Not set" in SETTINGS
    assert "snorlax.providerKeys" not in SETTINGS
    assert "KeychainStore.save" not in SETTINGS
    assert "bubbleModel" in CHAT
    assert "isKeyError" in CHAT
    assert "showSettings = true" in CHAT
    assert "model-kicker" in APP
    assert "model-error-link" in APP
    assert "Use default" in APP
    assert "putProviderKey" in APP
    assert "localStorage.setItem" not in APP or "apiKey" not in APP.split("localStorage.setItem", 1)[-1][:80]
    assert "snorlax.providerKeys" not in APP
    assert "/v1/settings/keys/" in API
    assert "openai" in DESKTOP and "anthropic" in DESKTOP and "gemini" in DESKTOP
    assert PHRASE in ROADMAP
    assert "/ v0.98 " in ROADMAP
    assert "per-agent model provider" in ROADMAP
    assert "## 102. v0.98" in SPEC
    assert "OpenAPI **0.19.0**" in SPEC
    assert "modelProvider.test.ts" in PKG
    assert "python3 ios/scripts/test_ios_model_provider.py" in CI
    assert not PANE.exists()
    print("ok")


if __name__ == "__main__":
    main()
