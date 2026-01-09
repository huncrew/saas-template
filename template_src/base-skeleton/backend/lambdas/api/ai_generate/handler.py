from __future__ import annotations

import json
from functools import lru_cache
from typing import Any, Dict

import boto3

from common.dynamodb import DynamoRepository
from common.env import get_required_env
from common.http import (
    empty_response,
    get_method,
    get_origin,
    is_preflight,
    json_response,
    parse_json_body,
)
from common.logging import get_logger
from common.ssm import get_parameter

logger = get_logger(__name__)
repository = DynamoRepository()
bedrock_client = boto3.client("bedrock-runtime")


@lru_cache(maxsize=1)
def _model_param_name() -> str:
    return get_required_env("BEDROCK_MODEL_PARAM")


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) != "POST":
        return json_response(
            405, {"success": False, "error": "Method not allowed"}, origin=origin
        )

    body = parse_json_body(event)
    prompt = body.get("prompt")
    model = body.get("model")
    max_tokens = int(body.get("maxTokens", 1000))
    temperature = float(body.get("temperature", 0.7))
    user_id = body.get("userId")

    if not prompt:
        return json_response(
            400, {"success": False, "error": "Prompt is required"}, origin=origin
        )

    try:
        if user_id:
            user = repository.get_user(user_id)
            if not user or user.get("subscriptionStatus") != "active":
                return json_response(
                    403,
                    {"success": False, "error": "Active subscription required for AI features"},
                    origin=origin,
                )

        param_name = _model_param_name()
        model_id = model or get_parameter(param_name) or param_name

        payload = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
        }

        response = bedrock_client.invoke_model(
            modelId=model_id,
            body=json.dumps(payload),
            accept="application/json",
            contentType="application/json",
        )

        response_body = response["body"].read()
        parsed_body = json.loads(response_body)
        content = parsed_body.get("content", [])
        ai_response = content[0].get("text") if content else "No response generated"
        tokens_used = parsed_body.get("usage", {}).get("output_tokens", 0)

        return json_response(
            200,
            {
                "success": True,
                "data": {
                    "response": ai_response,
                    "model": model_id,
                    "tokens": tokens_used,
                    "requestId": event.get("requestContext", {}).get("requestId"),
                },
            },
            origin=origin,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("AI generate handler failed")
        return json_response(
            500,
            {"success": False, "error": "AI processing failed", "message": str(exc)},
            origin=origin,
        )
