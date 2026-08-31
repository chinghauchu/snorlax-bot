# SPDX-License-Identifier: Apache-2.0
"""Per-agent durable facts on disk. Injected into the system prompt every turn.

Runtime-owned under ``SNORLAX_DATA_DIR/memory/{agentId}/``, not the sandbox
workspace. Shell / write_file stay jailed there.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
from pathlib import Path
from typing import Any

from snorlax_runtime import KIND_CHANNEL

MEMORY_DIRNAME = "memory"
MEMORY_FILENAME = "MEMORY.md"
MAX_FACTS = 32
MAX_FACT_CHARS = 400
ERR_MISSING_FACT = "Error: missing fact"
ERR_NO_MATCH = "Error: no matching fact"
ERR_TOO_LONG = "Error: fact is too long"
ERR_FULL = "Error: Memory is full"

_SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
_BULLET = re.compile(r"^\s*(?:[-*]|\d+[.)])\s+")


def memory_dir(data_dir: Path, agent_id: str) -> Path:
    """Runtime-owned per-agent directory. Not a workspace sandbox path."""
    return data_dir / MEMORY_DIRNAME / agent_id


def memory_path(data_dir: Path, agent_id: str) -> Path:
    return memory_dir(data_dir, agent_id) / MEMORY_FILENAME


def drop_memory(data_dir: Path, agent_id: str) -> None:
    """Remove that agent's memory dir. Missing dirs are fine. Never recreates."""
    if not _SAFE_ID.match(agent_id or ""):
        return
    shutil.rmtree(memory_dir(data_dir, agent_id), ignore_errors=True)


def normalize_fact(raw: str) -> str:
    """One self-contained sentence. Strips bullets and collapses whitespace."""
    text = (raw or "").replace("\r\n", "\n").replace("\r", "\n").strip()
    if not text:
        return ""
    first = text.split("\n", 1)[0].strip()
    first = _BULLET.sub("", first).strip()
    first = re.sub(r"\s+", " ", first)
    return first


def load_facts(data_dir: Path, agent_id: str) -> list[str]:
    if not _SAFE_ID.match(agent_id or ""):
        return []
    path = memory_path(data_dir, agent_id)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    facts: list[str] = []
    seen: set[str] = set()
    for raw in text.replace("\r\n", "\n").split("\n"):
        fact = normalize_fact(raw)
        if not fact:
            continue
        key = fact.casefold()
        if key in seen:
            continue
        seen.add(key)
        facts.append(fact)
        if len(facts) >= MAX_FACTS:
            break
    return facts


def save_facts(data_dir: Path, agent_id: str, facts: list[str]) -> None:
    if not _SAFE_ID.match(agent_id or ""):
        return
    root = memory_dir(data_dir, agent_id)
    path = memory_path(data_dir, agent_id)
    if not facts:
        shutil.rmtree(root, ignore_errors=True)
        return
    root.mkdir(parents=True, exist_ok=True)
    body = "".join(f"- {fact}\n" for fact in facts)
    fd, tmp_name = tempfile.mkstemp(
        prefix=".MEMORY.", suffix=".tmp", dir=str(root)
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(body)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def memory_preamble(facts: list[str]) -> str:
    if not facts:
        return ""
    lines = "\n".join(f"- {fact}" for fact in facts)
    return (
        "### Memory\n"
        "Curated facts you saved with the remember tool. They persist "
        "across restarts and are private to you. Use them. Do not recite "
        "this list unless asked. forget drops a fact by its exact recorded "
        "text.\n\n"
        f"{lines}"
    )


def attach_memory(system: str, data_dir: Path, speaker: dict[str, Any]) -> str:
    """Append this speaker's facts. Channel rows have no store; speakers do."""
    if speaker.get("kind") == KIND_CHANNEL:
        return system
    agent_id = str(speaker.get("id") or "")
    extra = memory_preamble(load_facts(data_dir, agent_id))
    if extra and "### Memory" not in system:
        return (system + "\n\n" + extra).strip()
    return system


def _parse_fact_arg(arguments: str) -> str:
    try:
        args = json.loads(arguments) if (arguments or "").strip() else {}
    except json.JSONDecodeError:
        return ""
    if not isinstance(args, dict):
        return ""
    return normalize_fact(str(args.get("fact") or ""))


def remember_fact(data_dir: Path, agent_id: str, fact: str) -> str:
    fact = normalize_fact(fact)
    if not fact:
        return ERR_MISSING_FACT
    if not _SAFE_ID.match(agent_id or ""):
        return ERR_MISSING_FACT
    if len(fact) > MAX_FACT_CHARS:
        return ERR_TOO_LONG
    facts = load_facts(data_dir, agent_id)
    for existing in facts:
        if existing == fact or existing.casefold() == fact.casefold():
            return "Remembered"
    if len(facts) >= MAX_FACTS:
        return ERR_FULL
    facts.append(fact)
    save_facts(data_dir, agent_id, facts)
    return "Remembered"


def forget_fact(data_dir: Path, agent_id: str, fact: str) -> str:
    wanted = normalize_fact(fact)
    if not wanted:
        return ERR_MISSING_FACT
    if not _SAFE_ID.match(agent_id or ""):
        return ERR_MISSING_FACT
    facts = load_facts(data_dir, agent_id)
    match_idx: int | None = None
    for i, existing in enumerate(facts):
        if existing == wanted:
            match_idx = i
            break
    if match_idx is None:
        folded = wanted.casefold()
        for i, existing in enumerate(facts):
            if existing.casefold() == folded:
                match_idx = i
                break
    if match_idx is None:
        return ERR_NO_MATCH
    facts.pop(match_idx)
    save_facts(data_dir, agent_id, facts)
    return "Forgot"


def remember_tool(data_dir: Path, agent_id: str, arguments: str) -> str:
    return remember_fact(data_dir, agent_id, _parse_fact_arg(arguments))


def forget_tool(data_dir: Path, agent_id: str, arguments: str) -> str:
    return forget_fact(data_dir, agent_id, _parse_fact_arg(arguments))
