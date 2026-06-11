"""Daily upstream-call budget breaker (spec 004 R3).

A process-wide counter of Mapbox calls made today (UTC). Callers reserve
capacity *before* spending; when the budget is exhausted they degrade (stale
cache or 503) instead of calling upstream. This is insurance against anything
slipping past the per-IP rate limiter — it bounds worst-case daily spend.
"""

from __future__ import annotations

import logging
import time

logger = logging.getLogger(__name__)

_count = 0
_day: int | None = None


class UsageBudgetError(Exception):
    """Raised when the daily upstream-call budget is exhausted."""


def reset() -> None:
    """Clear the counter (tests)."""
    global _count, _day
    _count = 0
    _day = None


def reserve(calls: int, daily_budget: int) -> bool:
    """Reserve `calls` upstream calls against today's budget.

    Returns True (and counts them) when capacity exists, False when the budget
    is exhausted. A budget of 0 disables the breaker entirely.
    """
    global _count, _day
    if daily_budget <= 0:
        return True
    today = int(time.time() // 86400)
    if today != _day:
        _day = today
        _count = 0
    if _count + calls > daily_budget:
        logger.warning("Upstream budget exhausted: %d/%d calls used today", _count, daily_budget)
        return False
    _count += calls
    return True


def spent_today() -> int:
    """Calls reserved so far today (0 after a day rollover)."""
    if _day != int(time.time() // 86400):
        return 0
    return _count
