from __future__ import annotations

import os
from functools import lru_cache
from typing import List, Optional


def get_env(name: str, default: Optional[str] = None) -> Optional[str]:
    """Read an environment variable with an optional default."""
    value = os.getenv(name, default)
    if value is None or (isinstance(value, str) and value.strip() == ""):
        return default
    return value


def get_required_env(name: str) -> str:
    """Read a required environment variable, raising if missing."""
    value = os.getenv(name)
    if value is None or value.strip() == "":
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


@lru_cache(maxsize=1)
def get_allowed_origins() -> List[str]:
    """Return the allowed CORS origins parsed from ALLOWED_ORIGINS env."""
    raw = os.getenv("ALLOWED_ORIGINS", "")
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or ["*"]
