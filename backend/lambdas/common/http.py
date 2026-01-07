from __future__ import annotations

import json
from typing import Any, Dict, Optional

from .env import get_allowed_origins


def get_method(event: Dict[str, Any]) -> str:
    """Extract the HTTP method from an API Gateway v2 event."""
    return (
        event.get("requestContext", {}).get("http", {}).get("method")
        or event.get("httpMethod")
        or ""
    ).upper()


def get_origin(event: Dict[str, Any]) -> Optional[str]:
    headers = event.get("headers") or {}
    return headers.get("origin") or headers.get("Origin")


def build_cors_headers(origin: Optional[str]) -> Dict[str, str]:
    allowed = get_allowed_origins()

    if "*" in allowed:
        resolved_origin = origin or "*"
    elif origin and origin in allowed:
        resolved_origin = origin
    else:
        resolved_origin = allowed[0] if allowed else "*"

    return {
        "Access-Control-Allow-Origin": resolved_origin,
        "Access-Control-Allow-Headers": "content-type,authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
        "Access-Control-Allow-Credentials": "true",
    }


def json_response(
    status: int,
    body: Optional[Dict[str, Any]] = None,
    origin: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None,
) -> Dict[str, Any]:
    headers = build_cors_headers(origin)
    if extra_headers:
        headers.update(extra_headers)

    payload = json.dumps(body or {})
    return {
        "statusCode": status,
        "headers": headers,
        "body": payload,
    }


def empty_response(status: int, origin: Optional[str] = None) -> Dict[str, Any]:
    headers = build_cors_headers(origin)
    return {
        "statusCode": status,
        "headers": headers,
        "body": "",
    }


def parse_json_body(event: Dict[str, Any]) -> Dict[str, Any]:
    body = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        from base64 import b64decode

        body = b64decode(body)
    if isinstance(body, bytes):
        body = body.decode("utf-8")
    try:
        return json.loads(body) if body else {}
    except json.JSONDecodeError:
        return {}


def is_preflight(event: Dict[str, Any]) -> bool:
    return get_method(event) == "OPTIONS"
