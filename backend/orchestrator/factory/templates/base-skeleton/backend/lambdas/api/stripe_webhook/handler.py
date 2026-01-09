from __future__ import annotations

import json
from base64 import b64decode
from functools import lru_cache
from typing import Any, Dict

import stripe

from common.dynamodb import DynamoRepository
from common.env import get_required_env
from common.http import get_method, json_response
from common.logging import get_logger
from common.ssm import get_parameter

logger = get_logger(__name__)
repository = DynamoRepository()



@lru_cache(maxsize=1)
def _stripe_secret_param() -> str:
    return get_required_env("STRIPE_SECRET_PARAM")


@lru_cache(maxsize=1)
def _stripe_webhook_param() -> str:
    return get_required_env("STRIPE_WEBHOOK_PARAM")


def handler(event: Dict[str, Any], _context: Any) -> Dict[str, Any]:
    if get_method(event) != "POST":
        return json_response(405, {"error": "Method not allowed"})

    signature = _extract_header(event.get("headers") or {}, "stripe-signature")
    if not signature:
        return json_response(400, {"error": "Missing Stripe signature"})

    payload = event.get("body") or ""
    if event.get("isBase64Encoded"):
        payload = b64decode(payload)
    if isinstance(payload, bytes):
        payload = payload.decode("utf-8")

    secret_key = get_parameter(_stripe_secret_param())
    webhook_secret = get_parameter(_stripe_webhook_param())
    if not secret_key or secret_key == "REPLACE_ME" or not webhook_secret:
        logger.error("Stripe configuration missing")
        return json_response(500, {"error": "Stripe configuration missing"})

    try:
        stripe_event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=signature,
            secret=webhook_secret,
        )
        stripe.api_key = secret_key
    except stripe.error.SignatureVerificationError as err:
        logger.warning("Stripe webhook signature verification failed: %s", err)
        return json_response(400, {"error": "Invalid signature"})

    try:
        _handle_event(stripe_event)
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Error handling Stripe webhook")
        return json_response(500, {"error": "Webhook handler failed", "message": str(exc)})

    return json_response(200, {"received": True})


def _handle_event(event: stripe.Event) -> None:
    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        _handle_checkout_completed(data)
        return

    if event_type in {"customer.subscription.updated", "customer.subscription.deleted"}:
        _handle_subscription_change(data)
        return

    logger.info("Unhandled Stripe event type: %s", event_type)


def _handle_checkout_completed(session: Dict[str, Any]) -> None:
    metadata = session.get("metadata") or {}
    user_id = metadata.get("userId")
    if not user_id or user_id == "anonymous":
        logger.warning("Checkout session missing userId metadata: %s", json.dumps(metadata))
        return

    repository.update_user(user_id, {"subscriptionStatus": "active"})

    subscription_id = session.get("subscription")
    if not subscription_id:
        logger.info("Checkout session has no subscription id for user %s", user_id)
        return

    subscription = stripe.Subscription.retrieve(subscription_id)
    repository.create_subscription(
        {
            "id": subscription.id,
            "userId": user_id,
            "stripeSubscriptionId": subscription.id,
            "status": subscription.status,
            "currentPeriodStart": _timestamp_to_iso(subscription.current_period_start),
            "currentPeriodEnd": _timestamp_to_iso(subscription.current_period_end),
            "planId": subscription.items.data[0].price.id if subscription.items.data else "unknown",
        }
    )


def _handle_subscription_change(subscription: Dict[str, Any]) -> None:
    metadata = subscription.get("metadata") or {}
    user_id = metadata.get("userId")
    if not user_id:
        logger.warning("Subscription event missing userId metadata")
        return

    status = "active" if subscription.get("status") == "active" else "inactive"
    repository.update_user(user_id, {"subscriptionStatus": status})


def _timestamp_to_iso(timestamp: Any) -> str:
    try:
        from datetime import datetime, timezone

        return datetime.fromtimestamp(int(timestamp), tz=timezone.utc).isoformat()
    except Exception:  # pylint: disable=broad-except
        return ""


def _extract_header(headers: Dict[str, Any], key: str) -> str:
    if not headers:
        return ""
    for candidate in (key, key.title(), key.upper()):
        if candidate in headers:
            return headers[candidate]
    return ""
