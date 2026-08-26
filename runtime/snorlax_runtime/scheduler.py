# SPDX-License-Identifier: Apache-2.0
"""Cron scheduler inside the FastAPI process. Fires with no client connected."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from snorlax_runtime.cron import cron_matches, now_taipei
from snorlax_runtime.db import Store, utcnow

log = logging.getLogger("snorlax.scheduler")

DEFAULT_INTERVAL_SECONDS = 15.0


def routine_wake_pack(routine: dict[str, Any], skill_body: str) -> dict[str, Any]:
    return {
        "kind": "routine",
        "name": routine.get("name") or "",
        "skill": routine.get("skill") or "",
        "body": skill_body,
    }


def is_routine_pack(pack: dict[str, Any] | None) -> bool:
    return bool(pack) and pack.get("kind") == "routine"


def is_cron_routine(routine: dict[str, Any]) -> bool:
    kind = str(routine.get("triggerType") or "cron").strip().lower()
    return kind in {"", "cron"}


def is_due(routine: dict[str, Any], when: datetime) -> bool:
    """True only if enabled and the cron matches this Asia/Taipei minute.

    Missed ticks while the runtime was down are skipped (no catch-up storm).
    Event-trigger routines are never due on the cron ticker.
    """
    if not routine.get("enabled"):
        return False
    if not is_cron_routine(routine):
        return False
    if not cron_matches(str(routine.get("schedule") or ""), when):
        return False
    last = routine.get("lastRunAt")
    if last:
        local = now_taipei(when)
        try:
            last_dt = datetime.strptime(str(last), "%Y-%m-%dT%H:%M:%S.%fZ").replace(
                tzinfo=timezone.utc
            )
        except ValueError:
            return True
        last_local = now_taipei(last_dt)
        if last_local.strftime("%Y%m%d%H%M") == local.strftime("%Y%m%d%H%M"):
            return False
    return True


async def fire_routine_now(
    store: Store,
    backend: Any,
    routine: dict[str, Any],
    *,
    max_tool_rounds: int | None = None,
) -> dict[str, Any] | None:
    """Run one routine's skill into that agent's 1:1. No-op if paused.

    Same SKILL.md / prompt path as cron. Isolation: never write into a
    peer 1:1. Result is role=assistant senderId=A with optional routineName.
    """
    from snorlax_runtime.routing import run_routine_turn

    if not routine.get("enabled"):
        return None
    from snorlax_runtime.computer import session_blocks_agent

    agent_id = str(routine.get("agentId") or routine.get("agent_id") or "")
    if agent_id and session_blocks_agent(agent_id):
        return None
    await store.mark_routine_run(routine["id"], utcnow())
    return await run_routine_turn(
        store,
        backend,
        routine,
        max_tool_rounds=max_tool_rounds,
    )


async def fire_due_routines(
    store: Store,
    backend: Any,
    *,
    now: datetime | None = None,
    max_tool_rounds: int | None = None,
) -> list[dict[str, Any]]:
    """Run every enabled routine whose cron matches ``now`` in Asia/Taipei.

    Only the current Taipei minute is considered. Missed ticks while the
    runtime was down are skipped (no catch-up storm). Result lands in that
    agent's 1:1 as role=assistant senderId=A with optional routineName.
    Isolation: never write into a peer 1:1. Paused routines do not fire.
    Webhook / Slack / GitHub routines are skipped here.
    """
    when = now_taipei(now)
    fired: list[dict[str, Any]] = []
    for routine in await store.list_all_routines():
        if not is_due(routine, when):
            continue
        try:
            saved = await fire_routine_now(
                store,
                backend,
                routine,
                max_tool_rounds=max_tool_rounds,
            )
        except Exception:
            log.exception("routine %s failed", routine.get("id"))
            continue
        fired.append({"routine": routine, "message": saved})
    return fired


async def run_scheduler(app: Any, *, interval: float = DEFAULT_INTERVAL_SECONDS) -> None:
    """Background loop. Cancelled on shutdown. Safe if a tick raises."""
    while True:
        try:
            await asyncio.sleep(interval)
            store: Store = app.state.store
            backend = app.state.backend
            settings = app.state.settings
            await fire_due_routines(
                store,
                backend,
                max_tool_rounds=getattr(settings, "tool_max_rounds", None),
            )
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("scheduler tick failed")
