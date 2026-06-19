"""Debug-mode NDJSON logger for session 343d1c (mission production)."""
from __future__ import annotations

import json
import time
from typing import Any

_LOG_PATH = "/Users/melihtasoglan/Desktop/smart-agency/.cursor/debug-343d1c.log"
_SESSION = "343d1c"


def debug_log(
    hypothesis_id: str,
    location: str,
    message: str,
    data: dict[str, Any] | None = None,
    *,
    run_id: str = "pre-fix",
) -> None:
    # region agent log
    try:
        import os

        os.makedirs(os.path.dirname(_LOG_PATH), exist_ok=True)
        payload = {
            "sessionId": _SESSION,
            "hypothesisId": hypothesis_id,
            "location": location,
            "message": message,
            "data": data or {},
            "timestamp": int(time.time() * 1000),
            "runId": run_id,
        }
        with open(_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
    # endregion
