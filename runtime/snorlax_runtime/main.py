# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import argparse

import uvicorn

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings, resolve_bind_host
from snorlax_runtime.db import token_exists_on_disk


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="snorlax-runtime")
    parser.add_argument("--host", default=None, help="Override bind host")
    parser.add_argument("--port", type=int, default=None)
    args = parser.parse_args(argv)

    settings = Settings()
    if args.port is not None:
        settings.port = args.port
    token_exists = bool(settings.token) or token_exists_on_disk(settings.data_dir)
    host = resolve_bind_host(
        token_exists=token_exists,
        override=args.host or settings.bind,
    )
    settings.bind = host
    app = create_app(settings)
    uvicorn.run(app, host=host, port=settings.port, log_level="info")


if __name__ == "__main__":
    main()
