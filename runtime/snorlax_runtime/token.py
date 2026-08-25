# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

TOKEN_FILENAME = "token"


def token_path(data_dir: Path) -> Path:
    return data_dir / TOKEN_FILENAME


def token_exists_on_disk(data_dir: Path) -> bool:
    path = token_path(data_dir)
    if not path.is_file():
        return False
    return bool(path.read_text(encoding="utf-8").strip())


def read_token_file(data_dir: Path) -> str | None:
    path = token_path(data_dir)
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8").strip()
    return text or None


def write_token_file(data_dir: Path, token: str) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    path = token_path(data_dir)
    path.write_text(token + "\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def resolve_token(*, env_token: str | None, data_dir: Path) -> str | None:
    """SNORLAX_TOKEN overrides the file. Clients never read this file."""
    if env_token:
        return env_token
    return read_token_file(data_dir)
