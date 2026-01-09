import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "lambdas"))

from common.http import build_cors_headers  # noqa: E402


def test_build_cors_headers_allows_origin():
    headers = build_cors_headers("https://example.com")
    assert headers["Access-Control-Allow-Origin"] in {"*", "https://example.com"}
    assert "Access-Control-Allow-Methods" in headers
