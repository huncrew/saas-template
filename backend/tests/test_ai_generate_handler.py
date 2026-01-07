import json
import os
import sys
from pathlib import Path

import pytest

# Make lambdas importable
sys.path.append(str(Path(__file__).resolve().parents[1] / "lambdas"))


class _DummyBody:
    def __init__(self, payload: bytes):
        self._payload = payload

    def read(self):
        return self._payload


def _event(body: dict):
    return {
        "requestContext": {"http": {"method": "POST"}, "requestId": "req_123"},
        "headers": {"origin": "http://localhost:3000"},
        "body": json.dumps(body),
        "isBase64Encoded": False,
    }


def test_ai_generate_accepts_message_field(monkeypatch):
    # Required at import time by common.dynamodb
    os.environ["DATABASE_TABLE_NAME"] = "dummy"
    os.environ["AWS_REGION"] = "us-east-1"
    os.environ["BEDROCK_MODEL_PARAM"] = "dummy-param"
    os.environ.pop("REQUIRE_SUBSCRIPTION_FOR_AI", None)

    from api.ai_generate import handler as mod  # noqa: E402

    class DummyBedrockClient:
        def invoke_model(self, **_kwargs):
            payload = {
                "content": [{"text": "hello-from-bedrock"}],
                "usage": {"output_tokens": 7},
            }
            return {"body": _DummyBody(json.dumps(payload).encode("utf-8"))}

    monkeypatch.setattr(mod, "bedrock_client", DummyBedrockClient())

    resp = mod.handler(
        _event(
            {
                "message": "hi",
                "model": "model-test",
                "maxTokens": 10,
                "temperature": 0.1,
                "userId": "user_1",
            }
        ),
        None,
    )

    assert resp["statusCode"] == 200
    parsed = json.loads(resp["body"])
    assert parsed["success"] is True
    assert parsed["data"]["response"] == "hello-from-bedrock"
    assert parsed["data"]["tokens"] == 7


def test_ai_generate_prefers_prompt_over_message(monkeypatch):
    os.environ["DATABASE_TABLE_NAME"] = "dummy"
    os.environ["AWS_REGION"] = "us-east-1"
    os.environ["BEDROCK_MODEL_PARAM"] = "dummy-param"
    os.environ.pop("REQUIRE_SUBSCRIPTION_FOR_AI", None)

    from api.ai_generate import handler as mod  # noqa: E402

    captured = {}

    class DummyBedrockClient:
        def invoke_model(self, **kwargs):
            captured["body"] = json.loads(kwargs["body"])
            payload = {
                "content": [{"text": "ok"}],
                "usage": {"output_tokens": 1},
            }
            return {"body": _DummyBody(json.dumps(payload).encode("utf-8"))}

    monkeypatch.setattr(mod, "bedrock_client", DummyBedrockClient())

    resp = mod.handler(
        _event(
            {
                "prompt": "PROMPT",
                "message": "MESSAGE",
                "model": "model-test",
            }
        ),
        None,
    )
    assert resp["statusCode"] == 200
    # ensure the request sent to bedrock used prompt text
    assert captured["body"]["messages"][0]["content"] == "PROMPT"


