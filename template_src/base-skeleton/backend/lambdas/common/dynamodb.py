from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Optional

import boto3

from .env import get_required_env
from .logging import get_logger

logger = get_logger(__name__)
_dynamodb = boto3.resource("dynamodb")
_table = _dynamodb.Table(get_required_env("DATABASE_TABLE_NAME"))


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


class DynamoRepository:
    """Convenience wrapper around DynamoDB operations for the SaaS template."""

    def __init__(self, table=None):
        self.table = table or _table

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        response = self.table.get_item(
            Key={
                "pk": f"USER#{user_id}",
                "sk": f"USER#{user_id}",
            }
        )
        return response.get("Item")

    def create_user(self, user: Dict[str, Any]) -> Dict[str, Any]:
        item = {
            "pk": f"USER#{user['id']}",
            "sk": f"USER#{user['id']}",
            "gsi1pk": f"EMAIL#{user['email']}",
            "gsi1sk": f"USER#{user['id']}",
            **user,
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
        self.table.put_item(Item=item)
        return item

    def update_user(self, user_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        update_expression_parts = []
        expression_attribute_values = {}
        expression_attribute_names = {}

        for key, value in updates.items():
            placeholder = f"#{key}"
            value_placeholder = f":{key}"
            expression_attribute_names[placeholder] = key
            expression_attribute_values[value_placeholder] = value
            update_expression_parts.append(f"{placeholder} = {value_placeholder}")

        expression_attribute_names["#updatedAt"] = "updatedAt"
        expression_attribute_values[":updatedAt"] = _now_iso()
        update_expression_parts.append("#updatedAt = :updatedAt")

        if not update_expression_parts:
            logger.warning("No updates supplied for user %s", user_id)
            return None

        response = self.table.update_item(
            Key={
                "pk": f"USER#{user_id}",
                "sk": f"USER#{user_id}",
            },
            UpdateExpression="SET " + ", ".join(update_expression_parts),
            ExpressionAttributeNames=expression_attribute_names,
            ExpressionAttributeValues=expression_attribute_values,
            ReturnValues="ALL_NEW",
        )
        return response.get("Attributes")

    def get_subscription(self, user_id: str) -> Optional[Dict[str, Any]]:
        response = self.table.get_item(
            Key={
                "pk": f"USER#{user_id}",
                "sk": f"SUBSCRIPTION#{user_id}",
            }
        )
        return response.get("Item")

    def create_subscription(self, subscription: Dict[str, Any]) -> Dict[str, Any]:
        item = {
            "pk": f"USER#{subscription['userId']}",
            "sk": f"SUBSCRIPTION#{subscription['userId']}",
            "gsi1pk": f"STRIPE#{subscription['stripeSubscriptionId']}",
            "gsi1sk": f"SUBSCRIPTION#{subscription['userId']}",
            **subscription,
            "createdAt": _now_iso(),
            "updatedAt": _now_iso(),
        }
        self.table.put_item(Item=item)
        return item
