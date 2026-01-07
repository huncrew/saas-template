from __future__ import annotations

from typing import Any, Dict

from common.dynamodb import DynamoRepository
from common.http import (
    empty_response,
    get_method,
    get_origin,
    is_preflight,
    json_response,
)
from common.logging import get_logger

logger = get_logger(__name__)
repository = DynamoRepository()


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) not in {"GET", "POST"}:
        return json_response(405, {"success": False, "error": "Method not allowed"}, origin=origin)

    user_id = (
        (event.get("pathParameters") or {}).get("userId")
        or (event.get("queryStringParameters") or {}).get("userId")
        or (event.get("queryStringParameters") or {}).get("user_id")
    )

    if not user_id:
        return json_response(
            400,
            {"success": False, "error": "User ID is required"},
            origin=origin,
        )

    try:
        subscription = repository.get_subscription(user_id)
        user = repository.get_user(user_id) or {}
        status = user.get("subscriptionStatus", "inactive")

        return json_response(
            200,
            {
                "success": True,
                "data": {
                    "subscription": subscription,
                    "subscriptionStatus": status,
                    "hasActiveSubscription": status == "active",
                },
            },
            origin=origin,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Subscription status handler failed")
        return json_response(
            500,
            {"success": False, "error": "Internal server error", "message": str(exc)},
            origin=origin,
        )
