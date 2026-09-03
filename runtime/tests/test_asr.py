# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import io
import stat
import wave
from pathlib import Path

from snorlax_runtime.asr import (
    ERR_EMPTY,
    ERR_FAILED,
    ERR_MAX,
    ERR_NO_SPEECH,
    ERR_UNAVAILABLE,
    MAX_AUDIO_BYTES,
    AsrError,
    is_wav,
    parse_whisper_stdout,
    resolve_whisper_bin,
    resolve_whisper_model,
    transcribe_audio,
    whisper_argv,
)
from tests.conftest import AUTH

HERE = Path(__file__).resolve()
ASR_SRC = HERE.parents[1] / "snorlax_runtime" / "asr.py"


def silent_wav(frames: int = 1600, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes(b"\x00\x00" * frames)
    return buf.getvalue()


def write_exec(path: Path, body: str = "#!/bin/sh\necho hello from the desk\n") -> Path:
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def test_whisper_argv_is_documented_local_cli() -> None:
    argv = whisper_argv(
        Path("/opt/whisper-cli"),
        Path("/models/ggml-base.en.bin"),
        Path("/tmp/speech.wav"),
        "en",
    )
    assert argv[0] == "/opt/whisper-cli"
    assert argv[1:3] == ["-m", "/models/ggml-base.en.bin"]
    assert argv[3:5] == ["-f", "/tmp/speech.wav"]
    assert "-nt" in argv
    assert argv[argv.index("-l") + 1] == "en"


def test_parse_whisper_stdout_strips_timestamps_and_chatter() -> None:
    raw = (
        "whisper_init_from_file_with_params_no_state: loading model\n"
        "[00:00:00.000 --> 00:00:01.200]  Hello from the desk\n"
        "main: processing audio\n"
    )
    assert parse_whisper_stdout(raw) == "Hello from the desk"
    assert parse_whisper_stdout("  plain line  \n") == "plain line"
    assert parse_whisper_stdout("") == ""


def test_resolve_bin_and_model_prefer_explicit_then_data_dir(tmp_path: Path) -> None:
    missing = resolve_whisper_bin(str(tmp_path / "nope"), tmp_path)
    assert missing is None
    bin_path = write_exec(tmp_path / "whisper-cli")
    assert resolve_whisper_bin(str(bin_path), tmp_path) == bin_path
    local_dir = tmp_path / "whisper"
    local_dir.mkdir()
    local_bin = write_exec(local_dir / "whisper-cli")
    assert resolve_whisper_bin(None, tmp_path) == local_bin
    model = local_dir / "ggml-base.en.bin"
    model.write_bytes(b"ggml")
    assert resolve_whisper_model(None, tmp_path) == model
    other = tmp_path / "tiny.bin"
    other.write_bytes(b"ggml")
    assert resolve_whisper_model(str(other), tmp_path) == other
    assert resolve_whisper_model(str(tmp_path / "gone.bin"), tmp_path) is None


def test_transcribe_audio_uses_injected_run_seam(tmp_path: Path) -> None:
    bin_path = write_exec(tmp_path / "whisper-cli")
    model = tmp_path / "ggml-base.en.bin"
    model.write_bytes(b"ggml")
    seen: list[list[str]] = []

    def run(argv: list[str], timeout: float) -> tuple[int, str, str]:
        seen.append(argv)
        assert timeout == 120.0
        return 0, "hello from the desk\n", ""

    text = transcribe_audio(
        silent_wav(),
        bin_path=bin_path,
        model_path=model,
        run=run,
        convert=lambda data, _n, _m: data,
    )
    assert text == "hello from the desk"
    assert seen and seen[0][0] == str(bin_path)
    assert "-m" in seen[0] and str(model) in seen[0]
    assert "-f" in seen[0] and "-nt" in seen[0]


def test_transcribe_audio_errors() -> None:
    try:
        transcribe_audio(b"", bin_path=None, model_path=None)
        raise AssertionError("expected empty")
    except AsrError as exc:
        assert exc.status == 422
        assert exc.message == ERR_EMPTY
    try:
        transcribe_audio(b"x" * (MAX_AUDIO_BYTES + 1), bin_path=None, model_path=None)
        raise AssertionError("expected max")
    except AsrError as exc:
        assert exc.status == 422
        assert exc.message == ERR_MAX
    try:
        transcribe_audio(b"xxxx", bin_path=None, model_path=None)
        raise AssertionError("expected unavailable")
    except AsrError as exc:
        assert exc.status == 503
        assert exc.message == ERR_UNAVAILABLE


def test_transcribe_audio_nonzero_and_blank_stdout(tmp_path: Path) -> None:
    bin_path = write_exec(tmp_path / "whisper-cli")
    model = tmp_path / "ggml-base.en.bin"
    model.write_bytes(b"ggml")
    wav = silent_wav()

    def fail(argv: list[str], timeout: float) -> tuple[int, str, str]:
        return 1, "", "boom"

    try:
        transcribe_audio(
            wav,
            bin_path=bin_path,
            model_path=model,
            run=fail,
            convert=lambda data, _n, _m: data,
        )
        raise AssertionError("expected fail")
    except AsrError as exc:
        assert exc.status == 422
        assert exc.message == ERR_FAILED

    def silent(argv: list[str], timeout: float) -> tuple[int, str, str]:
        return 0, "\n", ""

    try:
        transcribe_audio(
            wav,
            bin_path=bin_path,
            model_path=model,
            run=silent,
            convert=lambda data, _n, _m: data,
        )
        raise AssertionError("expected no speech")
    except AsrError as exc:
        assert exc.status == 422
        assert exc.message == ERR_NO_SPEECH


def test_seam_is_local_only() -> None:
    src = ASR_SRC.read_text(encoding="utf-8")
    assert "whisper.cpp" in src
    assert "api.openai.com" not in src
    assert "openai.com" not in src
    assert "api.groq.com" not in src
    assert "speech.googleapis.com" not in src
    assert "transcribe.aws" not in src


def test_is_wav_sniff() -> None:
    wav = silent_wav()
    assert is_wav(wav)
    assert not is_wav(b"not-wav")
    assert not is_wav(b"RIFF____NOTW")


def _post(client, data: bytes, name="speech.wav", mime="audio/wav"):
    return client.post(
        "/v1/transcribe",
        headers=AUTH,
        files={"audio": (name, data, mime)},
    )


def test_transcribe_401_without_bearer(client) -> None:
    response = client.post(
        "/v1/transcribe",
        files={"audio": ("speech.wav", silent_wav(), "audio/wav")},
    )
    assert response.status_code == 401


def test_transcribe_empty_422(client) -> None:
    response = _post(client, b"")
    assert response.status_code == 422
    assert response.json()["error"] == ERR_EMPTY


def test_transcribe_too_large_422(client) -> None:
    response = _post(client, b"x" * (MAX_AUDIO_BYTES + 1))
    assert response.status_code == 422
    assert response.json()["error"] == ERR_MAX


def test_transcribe_503_when_whisper_missing(client) -> None:
    response = _post(client, silent_wav())
    assert response.status_code == 503
    assert response.json()["error"] == ERR_UNAVAILABLE


def test_transcribe_200_with_local_binary(client, tmp_path, monkeypatch) -> None:
    from snorlax_runtime.app import create_app
    from snorlax_runtime.config import Settings
    from fastapi.testclient import TestClient

    bin_path = write_exec(tmp_path / "whisper-cli")
    model = tmp_path / "ggml-base.en.bin"
    model.write_bytes(b"ggml")
    settings = Settings(
        data_dir=tmp_path,
        token="test-token-snorlax",
        bind="127.0.0.1",
        inference_backend="mock",
        scheduler=False,
        whisper_bin=str(bin_path),
        whisper_model=str(model),
    )

    def run(argv: list[str], timeout: float) -> tuple[int, str, str]:
        assert argv[0] == str(bin_path)
        assert "-m" in argv and str(model) in argv
        return 0, "sit still and type this\n", ""

    monkeypatch.setattr("snorlax_runtime.asr.default_run", run)
    monkeypatch.setattr(
        "snorlax_runtime.asr.to_wav_bytes",
        lambda data, _n, _m: data,
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/transcribe",
            headers=AUTH,
            files={"audio": ("speech.wav", silent_wav(), "audio/wav")},
        )
    assert response.status_code == 200
    body = response.json()
    assert body == {"text": "sit still and type this"}
    assert set(body) == {"text"}


def test_transcribe_no_speech_422(client, tmp_path, monkeypatch) -> None:
    from snorlax_runtime.app import create_app
    from snorlax_runtime.config import Settings
    from fastapi.testclient import TestClient

    bin_path = write_exec(tmp_path / "whisper-cli")
    model = tmp_path / "ggml-base.en.bin"
    model.write_bytes(b"ggml")
    settings = Settings(
        data_dir=tmp_path,
        token="test-token-snorlax",
        bind="127.0.0.1",
        inference_backend="mock",
        scheduler=False,
        whisper_bin=str(bin_path),
        whisper_model=str(model),
    )

    def run(argv: list[str], timeout: float) -> tuple[int, str, str]:
        return 0, "\n", ""

    monkeypatch.setattr("snorlax_runtime.asr.default_run", run)
    monkeypatch.setattr(
        "snorlax_runtime.asr.to_wav_bytes",
        lambda data, _n, _m: data,
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/transcribe",
            headers=AUTH,
            files={"audio": ("speech.wav", silent_wav(), "audio/wav")},
        )
    assert response.status_code == 422
    assert response.json()["error"] == ERR_NO_SPEECH
