from __future__ import annotations

from functools import lru_cache
from typing import Any, Dict

import stripe

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
from common.ssm import get_parameter

logger = get_logger(__name__)


@lru_cache(maxsize=1)
def _stripe_secret_param() -> str:
    return get_required_env("STRIPE_SECRET_PARAM")


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    origin = get_origin(event)

    if is_preflight(event):
        return empty_response(200, origin=origin)

    if get_method(event) != "POST":
        return json_response(
            405, {"success": False, "error": "Method not allowed"}, origin=origin
        )

    body = parse_json_body(event)
    price_id = body.get("priceId") or body.get("price_id")
    user_id = body.get("userId") or "anonymous"

    if not price_id:
        return json_response(
            400,
            {"success": False, "error": "Price ID is required"},
            origin=origin,
        )

    try:
        secret_key = get_parameter(_stripe_secret_param())
        if not secret_key or secret_key == "REPLACE_ME":
            logger.error("Stripe secret parameter is not configured")
            return json_response(
                500,
                {"success": False, "error": "Stripe secret not configured"},
                origin=origin,
            )

        stripe.api_key = secret_key

        return_url_base = origin or get_env("DEFAULT_RETURN_URL", "https://example.com")
        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            ui_mode="embedded",
            line_items=[{"price": price_id, "quantity": 1}],
            mode="subscription",
            return_url=f"{return_url_base}/dashboard?session_id={{CHECKOUT_SESSION_ID}}",
            metadata={"userId": user_id},
        )

        return json_response(
            200,
            {
                "success": True,
                "data": {
                    "clientSecret": session.client_secret,
                    "sessionId": session.id,
                },
            },
            origin=origin,
        )
    except stripe.error.StripeError as err:
        logger.exception("Stripe API error")
        return json_response(
            500,
            {"success": False, "error": "Failed to create checkout session", "message": str(err)},
            origin=origin,
        )
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Unexpected error in stripe_checkout handler")
        return json_response(
            500,
            {"success": False, "error": "Internal server error", "message": str(exc)},
            origin=origin,
        )
