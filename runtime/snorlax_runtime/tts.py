# SPDX-License-Identifier: Apache-2.0
"""Local text-to-speech seam. Clients POST text; we shell to piper.

Never call a cloud TTS. Clients never see binary names in UI copy.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from collections.abc import Callable
from pathlib import Path

ERR_EMPTY = "Empty text."
ERR_MAX = "Max 8000 characters."
ERR_UNAVAILABLE = "Speech isn't available."
ERR_FAILED = "Couldn't speak."

MAX_TEXT_CHARS = 8000
TTS_DIRNAME = "tts"
BIN_NAMES = ("piper",)
MODEL_SUFFIX = ".onnx"

RunFn = Callable[[list[str], str, float], tuple[int, str, str]]


class TtsError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def piper_argv(bin_path: Path, model_path: Path, wav_path: Path) -> list[str]:
    """Documented piper CLI. Writes a WAV; text is stdin."""
    return [
        str(bin_path),
        "--model",
        str(model_path),
        "--output_file",
        str(wav_path),
    ]


def resolve_tts_bin(explicit: str | None, data_dir: Path) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.is_file() and os.access(path, os.X_OK) else None
    local = data_dir / TTS_DIRNAME / "piper"
    if local.is_file() and os.access(local, os.X_OK):
        return local
    for name in BIN_NAMES:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def resolve_tts_model(explicit: str | None, data_dir: Path) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.is_file() else None
    folder = data_dir / TTS_DIRNAME
    if not folder.is_dir():
        return None
    preferred = (
        "en_US-lessac-medium.onnx",
        "en_US-lessac-low.onnx",
        "en_US-amy-low.onnx",
    )
    for name in preferred:
        candidate = folder / name
        if candidate.is_file():
            return candidate
    onnx = sorted(folder.glob(f"*{MODEL_SUFFIX}"))
    return onnx[0] if onnx else None


def default_run(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
    completed = subprocess.run(
        argv,
        input=stdin_text,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return completed.returncode, completed.stdout or "", completed.stderr or ""


def normalize_speak_text(text: str | None) -> str:
    return (text or "").strip()


def synthesize_speech(
    text: str,
    *,
    bin_path: Path | None,
    model_path: Path | None,
    timeout: float = 120.0,
    run: RunFn | None = None,
) -> bytes:
    """Shell to piper. `run` is the subprocess seam for tests."""
    spoken = normalize_speak_text(text)
    if not spoken:
        raise TtsError(422, ERR_EMPTY)
    if len(spoken) > MAX_TEXT_CHARS:
        raise TtsError(422, ERR_MAX)
    if bin_path is None or model_path is None:
        raise TtsError(503, ERR_UNAVAILABLE)
    if not Path(bin_path).is_file() or not Path(model_path).is_file():
        raise TtsError(503, ERR_UNAVAILABLE)

    runner = run or default_run
    with tempfile.TemporaryDirectory(prefix="snorlax-tts-") as tmp:
        wav_path = Path(tmp) / "speech.wav"
        argv = piper_argv(Path(bin_path), Path(model_path), wav_path)
        try:
            code, _stdout, _stderr = runner(argv, spoken, timeout)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise TtsError(503, ERR_FAILED) from exc
        if code != 0:
            raise TtsError(503, ERR_FAILED)
        if not wav_path.is_file():
            raise TtsError(503, ERR_FAILED)
        data = wav_path.read_bytes()
        if not data:
            raise TtsError(503, ERR_FAILED)
        return data
