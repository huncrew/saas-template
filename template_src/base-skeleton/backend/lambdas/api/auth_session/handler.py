from __future__ import annotations

from typing import Any, Dict

from common.dynamodb import DynamoRepository
from common.http import (
    empty_response,
    get_method,
    get_origin,
    is_preflight,
    json_response,
    parse_json_body,
)
from common.logging import get_logger

logger = get_logger(__name__)
repository = DynamoRepository()


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) != "POST":
        return json_response(
            405,
            {"success": False, "error": "Method not allowed"},
            origin=origin,
        )

    body = parse_json_body(event)
    action = (body.get("action") or "").lower()
    user_id = body.get("userId") or body.get("user_id")
    user_data = body.get("userData") or body.get("user_data")

    try:
        if action == "getuser":
            if not user_id:
                return json_response(
                    400,
                    {"success": False, "error": "userId is required"},
                    origin=origin,
                )
            user = repository.get_user(user_id)
            return json_response(
                200,
                {"success": True, "data": user},
                origin=origin,
            )

        if action == "createuser":
            if not user_data:
                return json_response(
                    400,
                    {"success": False, "error": "userData is required"},
                    origin=origin,
                )
            created = repository.create_user(user_data)
            return json_response(
                200,
                {"success": True, "data": created},
                origin=origin,
            )

        return json_response(
            400,
            {"success": False, "error": "Invalid action"},
            origin=origin,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Auth session handler failed")
        return json_response(
            500,
            {"success": False, "error": "Internal server error", "message": str(exc)},
            origin=origin,
        )
