import copy
import threading
from datetime import datetime, timezone

_lock = threading.Lock()

_state: dict = {
    "t212": {"last_success": None, "last_error": None, "last_error_ts": None},
    "etoro": {"last_success": None, "last_error": None, "last_error_ts": None},
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def record_ok(provider_name: str) -> None:
    with _lock:
        if provider_name not in _state:
            _state[provider_name] = {"last_success": None, "last_error": None, "last_error_ts": None}
        _state[provider_name]["last_success"] = _now()


def record_err(provider_name: str, error_str: str) -> None:
    with _lock:
        if provider_name not in _state:
            _state[provider_name] = {"last_success": None, "last_error": None, "last_error_ts": None}
        _state[provider_name]["last_error"] = error_str
        _state[provider_name]["last_error_ts"] = _now()


def snapshot() -> dict:
    with _lock:
        return copy.deepcopy(_state)
