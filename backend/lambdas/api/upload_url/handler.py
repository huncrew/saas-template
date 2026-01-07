from __future__ import annotations

import uuid
from functools import lru_cache
from typing import Any, Dict

import boto3

from common.env import get_env, get_required_env
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
s3_client = boto3.client("s3")


@lru_cache(maxsize=1)
def _uploads_bucket() -> str:
    return get_required_env("UPLOADS_BUCKET")


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) != "POST":
        return json_response(
            405, {"success": False, "error": "Method not allowed"}, origin=origin
        )

    body = parse_json_body(event)
    file_name = body.get("fileName") or body.get("file_name") or f"{uuid.uuid4()}.bin"
    content_type = body.get("contentType") or body.get("content_type") or "application/octet-stream"
    expires_in = int(get_env("UPLOAD_URL_EXPIRATION", "900"))

    object_key = f"uploads/{uuid.uuid4()}-{file_name}"

    try:
        upload_url = s3_client.generate_presigned_url(
            ClientMethod="put_object",
            Params={
                "Bucket": _uploads_bucket(),
                "Key": object_key,
                "ContentType": content_type,
            },
            ExpiresIn=expires_in,
        )

        return json_response(
            200,
            {
                "success": True,
                "data": {
                    "uploadUrl": upload_url,
                    "key": object_key,
                    "expiresIn": expires_in,
                    "contentType": content_type,
                },
            },
            origin=origin,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to create presigned URL")
        return json_response(
            500,
            {"success": False, "error": "Failed to create presigned URL", "message": str(exc)},
            origin=origin,
        )
