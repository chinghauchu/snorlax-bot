# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import stat
from pathlib import Path

from snorlax_runtime.tts import (
    ERR_EMPTY,
    ERR_FAILED,
    ERR_MAX,
    ERR_UNAVAILABLE,
    MAX_TEXT_CHARS,
    TtsError,
    piper_argv,
    resolve_tts_bin,
    resolve_tts_model,
    synthesize_speech,
)
from tests.conftest import AUTH

HERE = Path(__file__).resolve()
TTS_SRC = HERE.parents[1] / "snorlax_runtime" / "tts.py"
SILENT_WAV = (
    b"RIFF$\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00"
    b"D\xac\x00\x00\x88X\x01\x00\x02\x00\x10\x00data\x00\x00\x00\x00"
)


def write_exec(path: Path, body: str = "#!/bin/sh\nexit 0\n") -> Path:
    path.write_text(body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)
    return path


def test_piper_argv_is_documented_local_cli() -> None:
    argv = piper_argv(
        Path("/opt/piper"),
        Path("/models/en_US-lessac-medium.onnx"),
        Path("/tmp/speech.wav"),
    )
    assert argv[0] == "/opt/piper"
    assert argv[1:3] == ["--model", "/models/en_US-lessac-medium.onnx"]
    assert argv[3:5] == ["--output_file", "/tmp/speech.wav"]


def test_resolve_bin_and_model_prefer_explicit_then_data_dir(tmp_path: Path) -> None:
    missing = resolve_tts_bin(str(tmp_path / "nope"), tmp_path)
    assert missing is None
    bin_path = write_exec(tmp_path / "piper")
    assert resolve_tts_bin(str(bin_path), tmp_path) == bin_path
    local_dir = tmp_path / "tts"
    local_dir.mkdir()
    local_bin = write_exec(local_dir / "piper")
    assert resolve_tts_bin(None, tmp_path) == local_bin
    model = local_dir / "en_US-lessac-medium.onnx"
    model.write_bytes(b"onnx")
    assert resolve_tts_model(None, tmp_path) == model
    other = tmp_path / "voice.onnx"
    other.write_bytes(b"onnx")
    assert resolve_tts_model(str(other), tmp_path) == other
    assert resolve_tts_model(str(tmp_path / "gone.onnx"), tmp_path) is None


def test_synthesize_speech_uses_injected_run_seam(tmp_path: Path) -> None:
    bin_path = write_exec(tmp_path / "piper")
    model = tmp_path / "en_US-lessac-medium.onnx"
    model.write_bytes(b"onnx")
    seen: list[tuple[list[str], str]] = []

    def run(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
        seen.append((argv, stdin_text))
        assert timeout == 120.0
        wav = Path(argv[argv.index("--output_file") + 1])
        wav.write_bytes(SILENT_WAV)
        return 0, "", ""

    data = synthesize_speech(
        "  hello from the desk  ",
        bin_path=bin_path,
        model_path=model,
        run=run,
    )
    assert data == SILENT_WAV
    assert seen and seen[0][0][0] == str(bin_path)
    assert "--model" in seen[0][0] and str(model) in seen[0][0]
    assert seen[0][1] == "hello from the desk"


def test_synthesize_speech_errors() -> None:
    try:
        synthesize_speech("", bin_path=None, model_path=None)
        raise AssertionError("expected empty")
    except TtsError as exc:
        assert exc.status == 422
        assert exc.message == ERR_EMPTY
    try:
        synthesize_speech("   \n", bin_path=None, model_path=None)
        raise AssertionError("expected whitespace empty")
    except TtsError as exc:
        assert exc.status == 422
        assert exc.message == ERR_EMPTY
    try:
        synthesize_speech("x" * (MAX_TEXT_CHARS + 1), bin_path=None, model_path=None)
        raise AssertionError("expected max")
    except TtsError as exc:
        assert exc.status == 422
        assert exc.message == ERR_MAX
    try:
        synthesize_speech("hello", bin_path=None, model_path=None)
        raise AssertionError("expected unavailable")
    except TtsError as exc:
        assert exc.status == 503
        assert exc.message == ERR_UNAVAILABLE


def test_synthesize_speech_nonzero_and_missing_wav(tmp_path: Path) -> None:
    bin_path = write_exec(tmp_path / "piper")
    model = tmp_path / "en_US-lessac-medium.onnx"
    model.write_bytes(b"onnx")

    def fail(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
        return 1, "", "boom"

    try:
        synthesize_speech("hello", bin_path=bin_path, model_path=model, run=fail)
        raise AssertionError("expected fail")
    except TtsError as exc:
        assert exc.status == 503
        assert exc.message == ERR_FAILED

    def silent(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
        return 0, "", ""

    try:
        synthesize_speech("hello", bin_path=bin_path, model_path=model, run=silent)
        raise AssertionError("expected missing wav")
    except TtsError as exc:
        assert exc.status == 503
        assert exc.message == ERR_FAILED


def test_seam_is_local_only() -> None:
    src = TTS_SRC.read_text(encoding="utf-8")
    assert "piper" in src
    assert "api.openai.com" not in src
    assert "openai.com" not in src
    assert "api.elevenlabs.io" not in src
    assert "elevenlabs.io" not in src
    assert "texttospeech.googleapis.com" not in src
    assert "speech.googleapis.com" not in src
    assert "api.amazon.com" not in src
    assert "polly" not in src.lower() or "piper" in src


def test_speak_401_without_bearer(client) -> None:
    response = client.post("/v1/speak", json={"text": "hello"})
    assert response.status_code == 401


def test_speak_empty_422(client) -> None:
    response = client.post("/v1/speak", headers=AUTH, json={"text": "   "})
    assert response.status_code == 422
    assert response.json()["error"] == ERR_EMPTY


def test_speak_too_large_422(client) -> None:
    response = client.post(
        "/v1/speak",
        headers=AUTH,
        json={"text": "x" * (MAX_TEXT_CHARS + 1)},
    )
    assert response.status_code == 422
    assert response.json()["error"] == ERR_MAX


def test_speak_503_when_piper_missing(client) -> None:
    response = client.post("/v1/speak", headers=AUTH, json={"text": "hello"})
    assert response.status_code == 503
    assert response.json()["error"] == ERR_UNAVAILABLE


def test_speak_200_with_local_binary(tmp_path, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from snorlax_runtime.app import create_app
    from snorlax_runtime.config import Settings

    bin_path = write_exec(tmp_path / "piper")
    model = tmp_path / "en_US-lessac-medium.onnx"
    model.write_bytes(b"onnx")
    settings = Settings(
        data_dir=tmp_path,
        token="test-token-snorlax",
        bind="127.0.0.1",
        inference_backend="mock",
        scheduler=False,
        tts_bin=str(bin_path),
        tts_model=str(model),
    )

    def run(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
        assert argv[0] == str(bin_path)
        assert "--model" in argv and str(model) in argv
        assert stdin_text == "sit still and hear this"
        wav = Path(argv[argv.index("--output_file") + 1])
        wav.write_bytes(SILENT_WAV)
        return 0, "", ""

    monkeypatch.setattr("snorlax_runtime.tts.default_run", run)
    app = create_app(settings)
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/speak",
            headers=AUTH,
            json={"text": "sit still and hear this"},
        )
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("audio/wav")
    assert response.content == SILENT_WAV


def test_speak_failed_engine_503(tmp_path, monkeypatch) -> None:
    from fastapi.testclient import TestClient

    from snorlax_runtime.app import create_app
    from snorlax_runtime.config import Settings

    bin_path = write_exec(tmp_path / "piper")
    model = tmp_path / "en_US-lessac-medium.onnx"
    model.write_bytes(b"onnx")
    settings = Settings(
        data_dir=tmp_path,
        token="test-token-snorlax",
        bind="127.0.0.1",
        inference_backend="mock",
        scheduler=False,
        tts_bin=str(bin_path),
        tts_model=str(model),
    )

    def run(argv: list[str], stdin_text: str, timeout: float) -> tuple[int, str, str]:
        return 1, "", "boom"

    monkeypatch.setattr("snorlax_runtime.tts.default_run", run)
    app = create_app(settings)
    with TestClient(app) as test_client:
        response = test_client.post(
            "/v1/speak",
            headers=AUTH,
            json={"text": "hello"},
        )
    assert response.status_code == 503
    assert response.json()["error"] == ERR_FAILED
