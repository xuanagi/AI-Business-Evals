"""Small synchronous JSON transport. No business rules and no automatic retries."""

import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request


class HttpExecutionError(RuntimeError):
    """Transport/protocol failure, not a business verdict."""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Do not forward credentials or silently change POST to GET.


def _reject_constant(value):
    raise ValueError("Non-finite JSON number")


def post_json(endpoint: str, payload: object, *, timeout: float = 30,
              token_env: str = "", max_response_bytes: int = 10_000_000) -> tuple[object, dict]:
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.fragment:
        raise ValueError("endpoint must be an HTTP(S) URL without credentials or fragment")
    if not math.isfinite(timeout) or timeout <= 0 or max_response_bytes <= 0:
        raise ValueError("timeout and response limit must be positive and finite")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token_env:
        token = os.environ.get(token_env)
        if not token:
            raise ValueError("Configured token environment variable is missing")
        if parsed.scheme != "https":
            raise ValueError("Bearer authentication requires HTTPS")
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode("utf-8")
    request = urllib.request.Request(endpoint, data=data, headers=headers, method="POST")
    started = time.perf_counter()
    try:
        with urllib.request.build_opener(_NoRedirect()).open(request, timeout=timeout) as response:
            status = response.status
            raw = response.read(max_response_bytes + 1)
    except urllib.error.HTTPError as exc:
        status = exc.code
        exc.close()
        raise HttpExecutionError(f"HTTP request failed (status {status})") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        # URLs, response bodies and headers can contain secrets; omit them from errors.
        raise HttpExecutionError("HTTP connection failed or timed out") from None
    elapsed = time.perf_counter() - started
    if not 200 <= status < 300:
        raise HttpExecutionError(f"Unexpected HTTP status {status}")
    if len(raw) > max_response_bytes:
        raise HttpExecutionError("HTTP response exceeds size limit")
    try:
        result = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant)
    except (ValueError, UnicodeError):
        raise HttpExecutionError("HTTP response is not valid UTF-8 JSON") from None
    return result, {"transport": "http", "method": "POST", "status": status,
                    "request_seconds": elapsed, "response_bytes": len(raw)}
