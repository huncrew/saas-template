from __future__ import annotations

from functools import lru_cache
from typing import Optional

import boto3

from .logging import get_logger

logger = get_logger(__name__)
_ssm_client = boto3.client("ssm")


@lru_cache(maxsize=128)
def get_parameter(name: str, with_decryption: bool = True) -> Optional[str]:
    """Fetch and cache a Parameter Store value."""
    try:
        response = _ssm_client.get_parameter(Name=name, WithDecryption=with_decryption)
    except _ssm_client.exceptions.ParameterNotFound:
        logger.error("SSM parameter not found: %s", name)
        return None

    return response["Parameter"]["Value"]
