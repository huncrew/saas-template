from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from common.http import (
    empty_response,
    get_method,
    get_origin,
    is_preflight,
    json_response,
)
from common.logging import get_logger

logger = get_logger(__name__)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) not in {"GET", "POST"}:
        return json_response(405, {"success": False, "error": "Method not allowed"}, origin=origin)

    user_id = (
        (event.get("pathParameters") or {}).get("userId")
        or (event.get("queryStringParameters") or {}).get("userId")
    )

    if not user_id:
        return json_response(
            400,
            {"success": False, "error": "User ID is required"},
            origin=origin,
        )

    # Placeholder implementation until DynamoDB storage is wired up.
    now_iso = datetime.now(tz=timezone.utc).isoformat()
    logger.info("Returning stubbed AI history for user %s", user_id)

    return json_response(
        200,
        {
            "success": True,
            "data": [
                {
                    "id": "session-1",
                    "prompt": "Analyze this data...",
                    "response": "Based on the analysis...",
                    "model": "anthropic.claude-3-haiku-20240307-v1:0",
                    "tokens": 150,
                    "createdAt": now_iso,
                }
            ],
        },
        origin=origin,
    )
