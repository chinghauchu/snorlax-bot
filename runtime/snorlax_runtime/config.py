# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SNORLAX_",
        extra="ignore",
    )

    data_dir: Path = Field(default_factory=lambda: Path.home() / ".snorlax-bot")
    token: str | None = None
    bind: str | None = None
    port: int = 8787
    inference_backend: str = "mock"
    vllm_base_url: str = "http://127.0.0.1:8000/v1"
    omlx_base_url: str = "http://127.0.0.1:8000/v1"
    model: str = "meta-llama/Llama-3.3-70B-Instruct-FP8"
    inference_api_key: str | None = None
    inference_send_auth: bool | None = None
    tool_max_rounds: int = 8

    def resolved_backend(self) -> str:
        name = self.inference_backend.strip().lower()
        if name in {"openai", "openai-compat", "openai_compat"}:
            name = "omlx"
        if name not in {"mock", "omlx", "vllm"}:
            raise ValueError(
                "SNORLAX_INFERENCE_BACKEND must be 'mock', 'omlx', or 'vllm', "
                f"got {self.inference_backend!r}"
            )
        return name

    def inference_base_url(self) -> str | None:
        name = self.resolved_backend()
        if name == "omlx":
            return self.omlx_base_url
        if name == "vllm":
            return self.vllm_base_url
        return None


def resolve_bind_host(*, token_exists: bool, override: str | None) -> str:
    """Localhost until a token exists, then LAN. Override wins."""
    if override:
        return override
    return "0.0.0.0" if token_exists else "127.0.0.1"
