from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

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


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) != "POST":
        return json_response(
            405, {"success": False, "error": "Method not allowed"}, origin=origin
        )

    body = parse_json_body(event)
    query_text = body.get("query") or body.get("prompt")

    if not query_text:
        return json_response(
            400,
            {"success": False, "error": "Query text is required"},
            origin=origin,
        )

    logger.info("Returning stub RAG response for query")

    return json_response(
        200,
        {
            "success": True,
            "data": {
                "answer": "This is a placeholder response until the RAG pipeline is connected.",
                "query": query_text,
                "sources": [],
                "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
            },
        },
        origin=origin,
    )
