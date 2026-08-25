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
    model: str = "nvidia/Llama-3.3-70B-Instruct-FP8"
    vllm_connect_timeout: float = 10.0
    vllm_read_timeout: float = 120.0
    vllm_write_timeout: float = 30.0

    def resolved_backend(self) -> str:
        name = self.inference_backend.strip().lower()
        if name not in {"mock", "vllm"}:
            raise ValueError(
                f"SNORLAX_INFERENCE_BACKEND must be 'mock' or 'vllm', got {name!r}"
            )
        return name


def resolve_bind_host(*, token_exists: bool, override: str | None) -> str:
    """Localhost until a token exists, then LAN. Override wins."""
    if override:
        return override
    return "0.0.0.0" if token_exists else "127.0.0.1"
