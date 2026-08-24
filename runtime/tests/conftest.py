# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings

TOKEN = "test-token-snorlax"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


@pytest.fixture
def client(tmp_path):
    settings = Settings(
        data_dir=tmp_path,
        token=TOKEN,
        bind="127.0.0.1",
        inference_backend="mock",
        port=8787,
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        yield test_client


def parse_sse(body: str) -> list[tuple[str, dict]]:
    import json

    events: list[tuple[str, dict]] = []
    event = None
    data_lines: list[str] = []
    for line in body.splitlines():
        if line.startswith("event:"):
            event = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())
        elif line == "" and event is not None:
            events.append((event, json.loads("\n".join(data_lines))))
            event = None
            data_lines = []
    if event is not None and data_lines:
        events.append((event, json.loads("\n".join(data_lines))))
    return events
