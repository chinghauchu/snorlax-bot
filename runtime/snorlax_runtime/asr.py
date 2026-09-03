# SPDX-License-Identifier: Apache-2.0
"""Local speech-to-text seam. Desktop POSTs audio; we shell to whisper.cpp.

Never call a cloud STT. Clients never see binary names in UI copy.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import wave
from collections.abc import Callable
from pathlib import Path

ERR_EMPTY = "Empty audio."
ERR_MAX = "Max 25MB."
ERR_UNAVAILABLE = "Speech recognition isn't available."
ERR_FAILED = "Couldn't transcribe."
ERR_NO_SPEECH = "No speech detected."

MAX_AUDIO_BYTES = 25 * 1024 * 1024
WHISPER_DIRNAME = "whisper"
BIN_NAMES = ("whisper-cli", "whisper-cpp")
MODEL_NAMES = (
    "ggml-base.en.bin",
    "ggml-tiny.en.bin",
    "ggml-base.bin",
    "ggml-tiny.bin",
)

RunFn = Callable[[list[str], float], tuple[int, str, str]]


class AsrError(Exception):
    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


def is_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"


def whisper_argv(
    bin_path: Path,
    model_path: Path,
    wav_path: Path,
    language: str = "auto",
) -> list[str]:
    """Documented whisper.cpp CLI. Mac Metal and NVIDIA CUDA share this."""
    lang = (language or "auto").strip() or "auto"
    return [
        str(bin_path),
        "-m",
        str(model_path),
        "-f",
        str(wav_path),
        "-nt",
        "-l",
        lang,
    ]


def parse_whisper_stdout(text: str) -> str:
    """Keep recognized words. Drop timestamps and whisper.cpp chatter."""
    lines: list[str] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        if not line:
            continue
        lowered = line.lower()
        if lowered.startswith("whisper_") or lowered.startswith("system_info"):
            continue
        if lowered.startswith("main:") or "whisper.cpp" in lowered:
            continue
        if line.startswith("[") and "]" in line:
            line = line.split("]", 1)[1].strip()
            if not line:
                continue
        lines.append(line)
    return " ".join(lines).strip()


def resolve_whisper_bin(explicit: str | None, data_dir: Path) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.is_file() and os.access(path, os.X_OK) else None
    local = data_dir / WHISPER_DIRNAME / "whisper-cli"
    if local.is_file() and os.access(local, os.X_OK):
        return local
    for name in BIN_NAMES:
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def resolve_whisper_model(explicit: str | None, data_dir: Path) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.is_file() else None
    folder = data_dir / WHISPER_DIRNAME
    for name in MODEL_NAMES:
        candidate = folder / name
        if candidate.is_file():
            return candidate
    return None


def default_run(argv: list[str], timeout: float) -> tuple[int, str, str]:
    completed = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )
    return completed.returncode, completed.stdout or "", completed.stderr or ""


def _suffix_for(name: str, mime: str) -> str:
    raw = (name or "").rsplit(".", 1)
    if len(raw) == 2 and 1 <= len(raw[1]) <= 8 and raw[1].isalnum():
        return "." + raw[1].lower()
    kind = (mime or "").split(";")[0].strip().lower()
    if kind in {"audio/webm", "video/webm"}:
        return ".webm"
    if kind in {"audio/ogg", "application/ogg"}:
        return ".ogg"
    if kind in {"audio/mp4", "video/mp4"}:
        return ".m4a"
    if kind in {"audio/mpeg", "audio/mp3"}:
        return ".mp3"
    if kind in {"audio/wav", "audio/x-wav", "audio/wave"}:
        return ".wav"
    return ".bin"


def to_wav_bytes(data: bytes, name: str, mime: str) -> bytes:
    if is_wav(data):
        return data
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise AsrError(422, ERR_FAILED)
    with tempfile.TemporaryDirectory(prefix="snorlax-asr-") as tmp:
        src = Path(tmp) / f"in{_suffix_for(name, mime)}"
        dst = Path(tmp) / "out.wav"
        src.write_bytes(data)
        try:
            completed = subprocess.run(
                [
                    ffmpeg,
                    "-y",
                    "-i",
                    str(src),
                    "-ar",
                    "16000",
                    "-ac",
                    "1",
                    "-c:a",
                    "pcm_s16le",
                    str(dst),
                ],
                capture_output=True,
                timeout=60,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise AsrError(422, ERR_FAILED) from exc
        if completed.returncode != 0 or not dst.is_file():
            raise AsrError(422, ERR_FAILED)
        return dst.read_bytes()


def _wav_has_frames(data: bytes) -> bool:
    if not is_wav(data):
        return True
    try:
        with wave.open(io.BytesIO(data), "rb") as handle:
            return handle.getnframes() > 0
    except wave.Error:
        return True


def transcribe_audio(
    data: bytes,
    *,
    name: str = "audio.wav",
    mime: str = "audio/wav",
    bin_path: Path | None,
    model_path: Path | None,
    language: str = "auto",
    timeout: float = 120.0,
    run: RunFn | None = None,
    convert: Callable[[bytes, str, str], bytes] | None = None,
) -> str:
    """Shell to whisper.cpp. `run` is the subprocess seam for tests."""
    if not data:
        raise AsrError(422, ERR_EMPTY)
    if len(data) > MAX_AUDIO_BYTES:
        raise AsrError(422, ERR_MAX)
    if bin_path is None or model_path is None:
        raise AsrError(503, ERR_UNAVAILABLE)
    if not Path(bin_path).is_file() or not Path(model_path).is_file():
        raise AsrError(503, ERR_UNAVAILABLE)

    wav = (convert or to_wav_bytes)(data, name, mime)
    if not wav:
        raise AsrError(422, ERR_EMPTY)
    if not _wav_has_frames(wav):
        raise AsrError(422, ERR_NO_SPEECH)

    runner = run or default_run
    with tempfile.TemporaryDirectory(prefix="snorlax-asr-") as tmp:
        wav_path = Path(tmp) / "speech.wav"
        wav_path.write_bytes(wav)
        argv = whisper_argv(Path(bin_path), Path(model_path), wav_path, language)
        try:
            code, stdout, _stderr = runner(argv, timeout)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise AsrError(422, ERR_FAILED) from exc
        if code != 0:
            raise AsrError(422, ERR_FAILED)
        text = parse_whisper_stdout(stdout)
        if not text:
            raise AsrError(422, ERR_NO_SPEECH)
        return text
