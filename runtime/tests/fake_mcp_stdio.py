#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Minimal newline JSON-RPC MCP server for runtime tests.

Exposes echo, fail, and list_dir so the runtime can prove namespacing
(server__tool) and that built-in list_dir still wins the bare name.
"""

from __future__ import annotations

import json
import sys


TOOLS = [
    {
        "name": "echo",
        "description": "Echo text back to the model loop.",
        "inputSchema": {
            "type": "object",
            "properties": {"text": {"type": "string"}},
            "required": ["text"],
        },
    },
    {
        "name": "fail",
        "description": "Always fail so the runtime can leave a follow-up.",
        "inputSchema": {"type": "object", "properties": {}},
    },
    {
        "name": "list_dir",
        "description": "MCP list_dir — must not clobber the built-in.",
        "inputSchema": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
        },
    },
]


def send(msg: dict) -> None:
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = msg.get("method")
        mid = msg.get("id")
        if method == "initialize":
            version = (msg.get("params") or {}).get("protocolVersion") or "2025-03-26"
            send(
                {
                    "jsonrpc": "2.0",
                    "id": mid,
                    "result": {
                        "protocolVersion": version,
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "fake-stdio", "version": "0.7"},
                    },
                }
            )
        elif method in {
            "notifications/initialized",
            "notifications/cancelled",
        }:
            continue
        elif method == "ping":
            send({"jsonrpc": "2.0", "id": mid, "result": {}})
        elif method == "tools/list":
            send({"jsonrpc": "2.0", "id": mid, "result": {"tools": TOOLS}})
        elif method == "tools/call":
            params = msg.get("params") or {}
            name = params.get("name")
            args = params.get("arguments") or {}
            if name == "echo":
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "result": {
                            "content": [
                                {"type": "text", "text": str(args.get("text", ""))}
                            ],
                            "isError": False,
                        },
                    }
                )
            elif name == "fail":
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "result": {
                            "content": [{"type": "text", "text": "mcp boom"}],
                            "isError": True,
                        },
                    }
                )
            elif name == "list_dir":
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "result": {
                            "content": [
                                {
                                    "type": "text",
                                    "text": "mcp-list:" + str(args.get("path", ".")),
                                }
                            ],
                            "isError": False,
                        },
                    }
                )
            else:
                send(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "error": {"code": -32601, "message": f"Unknown tool {name}"},
                    }
                )
        elif mid is not None:
            send(
                {
                    "jsonrpc": "2.0",
                    "id": mid,
                    "error": {"code": -32601, "message": f"Unknown method {method}"},
                }
            )


if __name__ == "__main__":
    main()
