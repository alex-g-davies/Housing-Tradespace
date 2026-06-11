"""Logging configuration (spec 004 R5).

`LOG_FORMAT=json` switches all app logs to single-line JSON for cloud log
ingestion; the default stays human-readable for local dev. Request-scoped
fields (method, path, status, duration_ms, client_ip) are attached by the
access-log middleware in main.py via `extra=` and serialized when present.
"""

from __future__ import annotations

import json
import logging

_REQUEST_FIELDS = ("method", "path", "status", "duration_ms", "client_ip")


class JsonFormatter(logging.Formatter):
    """One JSON object per line; never includes anything token-derived."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for field in _REQUEST_FIELDS:
            value = record.__dict__.get(field)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging(log_format: str) -> None:
    """Configure the root logger once at startup."""
    handler = logging.StreamHandler()
    if log_format.lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    root.handlers = [handler]
