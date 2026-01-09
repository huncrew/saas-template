from __future__ import annotations

from typing import Any, Dict, List

from common.logging import get_logger

logger = get_logger(__name__)


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    records: List[Dict[str, Any]] = event.get("Records", [])
    for record in records:
        s3_info = record.get("s3", {})
        bucket = s3_info.get("bucket", {}).get("name")
        key = s3_info.get("object", {}).get("key")
        logger.info("Received S3 event for bucket %s key %s", bucket, key)
        # Placeholder: hook up document parsing and enrichment pipeline here.

    return {"statusCode": 200, "body": "ok"}
