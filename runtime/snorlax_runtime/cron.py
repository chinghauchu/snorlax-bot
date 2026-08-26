# SPDX-License-Identifier: Apache-2.0
"""5-field cron plus named hours, always interpreted in Asia/Taipei."""

from __future__ import annotations

import re
from datetime import datetime
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")

_NAMED_RE = re.compile(
    r"^\s*(?:every\s+)?(?P<days>day|weekday|weekdays)?\s*(?:at\s+)?"
    r"(?P<hour>\d{1,2})(?::(?P<minute>\d{2}))?\s*(?P<ampm>am|pm)\s*$",
    re.I,
)
_FIELD_RE = re.compile(r"^(\*|\d+)(?:-(\d+))?(?:/(\d+))?$")


class CronError(ValueError):
    def __init__(self, message: str = "invalid cron schedule") -> None:
        super().__init__(message)
        self.message = message


def now_taipei(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(TAIPEI)
    if now.tzinfo is None:
        return now.replace(tzinfo=TAIPEI)
    return now.astimezone(TAIPEI)


def parse_schedule(raw: str) -> tuple[str, str]:
    """Return ``(cron, scheduleLabel)``.

    Named hours (``8am``, ``weekdays at 9am``) compile to 5-field cron.
    ``scheduleLabel`` is humanized Taipei words (``Weekdays 9:00``).
    """
    text = (raw or "").strip()
    if not text:
        raise CronError("schedule is required")
    named = _parse_named(text)
    if named is not None:
        return named
    fields = text.split()
    if len(fields) != 5:
        raise CronError("schedule must be 5-field cron or a named hour like 8am")
    _validate_cron_fields(fields)
    cron = " ".join(fields)
    return cron, schedule_words(cron)


def _parse_named(text: str) -> tuple[str, str] | None:
    match = _NAMED_RE.match(text)
    if match is None:
        return None
    hour = int(match.group("hour"))
    minute = int(match.group("minute") or 0)
    ampm = match.group("ampm").lower()
    if hour < 1 or hour > 12 or minute > 59:
        raise CronError("invalid named hour")
    if ampm == "am":
        hour24 = 0 if hour == 12 else hour
    else:
        hour24 = 12 if hour == 12 else hour + 12
    days = (match.group("days") or "day").lower()
    dow = "1-5" if days.startswith("weekday") else "*"
    cron = f"{minute} {hour24} * * {dow}"
    return cron, schedule_words(cron)


def _validate_cron_fields(fields: list[str]) -> None:
    bounds = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))
    for field, (lo, hi) in zip(fields, bounds, strict=True):
        for part in field.split(","):
            _validate_cron_part(part, lo, hi)


def _validate_cron_part(part: str, lo: int, hi: int) -> None:
    match = _FIELD_RE.match(part)
    if match is None:
        raise CronError("invalid cron schedule")
    start_s, end_s, step_s = match.groups()
    if start_s == "*":
        start, end = lo, hi
    else:
        start = int(start_s)
        end = int(end_s) if end_s is not None else start
    step = int(step_s) if step_s else 1
    if step < 1 or start < lo or end > hi or start > end:
        raise CronError("invalid cron schedule")


def cron_matches(cron: str, when: datetime) -> bool:
    fields = cron.split()
    if len(fields) != 5:
        return False
    local = now_taipei(when)
    values = (local.minute, local.hour, local.day, local.month, local.weekday())
    bounds = ((0, 59), (0, 23), (1, 31), (1, 12), (0, 7))
    # datetime.weekday(): Mon=0 … Sun=6. Cron: Sun=0 or 7, Mon=1 … Sat=6.
    cron_dow = (local.weekday() + 1) % 7
    for i, field in enumerate(fields):
        value = cron_dow if i == 4 else values[i]
        lo, hi = bounds[i]
        if not _field_matches(field, value, lo, hi, dow=(i == 4)):
            return False
    return True


def _field_matches(
    field: str, value: int, lo: int, hi: int, *, dow: bool
) -> bool:
    for part in field.split(","):
        match = _FIELD_RE.match(part)
        if match is None:
            return False
        start_s, end_s, step_s = match.groups()
        if start_s == "*":
            start, end = lo, hi
        else:
            start = int(start_s)
            end = int(end_s) if end_s is not None else start
        step = int(step_s) if step_s else 1
        candidates = list(range(start, end + 1, step))
        if dow:
            expanded: set[int] = set()
            for item in candidates:
                if item == 7:
                    expanded.add(0)
                else:
                    expanded.add(item)
            if value in expanded:
                return True
        elif value in candidates:
            return True
    return False


def schedule_words(cron: str) -> str:
    fields = cron.split()
    if len(fields) != 5:
        return cron
    minute, hour, dom, month, dow = fields
    if not (minute.isdigit() and hour.isdigit()):
        return cron
    clock = f"{int(hour)}:{int(minute):02d}"
    if dom == "*" and month == "*" and dow == "*":
        return f"Every day {clock}"
    if dom == "*" and month == "*" and dow in {"1-5", "1,2,3,4,5"}:
        return f"Weekdays {clock}"
    if dom == "*" and month == "*" and dow in {"0,6", "6,0"}:
        return f"Weekends {clock}"
    return cron
