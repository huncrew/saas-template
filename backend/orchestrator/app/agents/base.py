"""
Base Agent class and core types for the agent framework.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, Optional, TypeVar
import os

import boto3

logger = logging.getLogger(__name__)


class AgentStatus(Enum):
    IDLE = "idle"
    RUNNING = "running"
    WAITING_FOR_INPUT = "waiting_for_input"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AgentState:
    """Base state that all agents can extend."""
    status: AgentStatus = AgentStatus.IDLE
    iteration: int = 0
    max_iterations: int = 10
    errors: list[str] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def update(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def add_error(self, error: str) -> None:
        self.errors.append(error)
        self.update()

    def can_continue(self) -> bool:
        return (
            self.status not in (AgentStatus.COMPLETED, AgentStatus.FAILED)
            and self.iteration < self.max_iterations
        )


StateT = TypeVar("StateT", bound=AgentState)
ResultT = TypeVar("ResultT")


@dataclass
class AgentResult(Generic[ResultT]):
    """Result from an agent execution."""
    success: bool
    data: Optional[ResultT] = None
    error: Optional[str] = None
    should_continue: bool = False  # For autonomous loops
    next_action: Optional[str] = None  # Hint for orchestrator


class AIClient:
    """
    Client for calling AI models via Bedrock directly.
    No Lambda/API Gateway - direct ECS → Bedrock for better performance.

    Required env vars (set in Terraform):
    - BEDROCK_MODEL_ID: Full ARN of the inference profile
    - AWS_REGION: Region for Bedrock calls (e.g., us-east-1)
    """

    def __init__(self, model_id: Optional[str] = None):
        self.model_id = model_id or os.getenv("BEDROCK_MODEL_ID")
        if not self.model_id:
            raise RuntimeError("BEDROCK_MODEL_ID env var is required")
        self._bedrock = None

    @property
    def bedrock(self):
        """Lazy-init Bedrock client. Uses AWS_REGION env var."""
        if self._bedrock is None:
            # boto3 automatically uses AWS_REGION env var
            self._bedrock = boto3.client("bedrock-runtime")
        return self._bedrock

    def generate(
        self,
        prompt: str,
        user_id: str,
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Call Bedrock directly to generate text.
        Returns the raw text response.
        """
        logger.info(f"[AIClient] Calling Bedrock model={self.model_id} tokens={max_tokens}")

        # Build messages
        messages = [{"role": "user", "content": [{"text": prompt}]}]

        # Build system prompts list
        system_prompts = []
        if system:
            system_prompts = [{"text": system}]

        # Call Bedrock Converse API
        try:
            response = self.bedrock.converse(
                modelId=self.model_id,
                messages=messages,
                system=system_prompts if system_prompts else None,
                inferenceConfig={
                    "temperature": temperature,
                    "maxTokens": max_tokens,
                },
            )
        except Exception as exc:
            logger.error(f"[AIClient] Bedrock call failed: {exc}")
            raise RuntimeError(f"AI generate failed: {exc}") from exc

        # Extract response text
        output = response.get("output", {})
        message = output.get("message", {})
        content_blocks = message.get("content", [])

        text_parts = []
        for block in content_blocks:
            if "text" in block:
                text_parts.append(block["text"])

        result = "\n".join(text_parts)
        logger.info(f"[AIClient] Got response: {len(result)} chars")
        return result

    def generate_json(
        self,
        prompt: str,
        user_id: str,
        system: Optional[str] = None,
        temperature: float = 0.2,
        max_tokens: int = 4096,
    ) -> dict:
        """
        Call AI and parse response as JSON.
        Handles markdown code fences.
        """
        response = self.generate(prompt, user_id, system, temperature, max_tokens)
        return self._extract_json(response)

    def _extract_json(self, text: str) -> dict:
        """Extract JSON from response, handling code fences and malformed JSON."""
        t = (text or "").strip()
        if not t:
            return {}

        # Handle ```json fences
        if "```json" in t:
            start = t.find("```json") + len("```json")
            end = t.find("```", start)
            if end != -1:
                t = t[start:end].strip()
        elif "```" in t:
            # Generic code fence
            start = t.find("```") + 3
            # Skip language identifier if present
            newline = t.find("\n", start)
            if newline != -1:
                start = newline + 1
            end = t.find("```", start)
            if end != -1:
                t = t[start:end].strip()

        if t.startswith("{") and "}" in t:
            # Try parsing as-is first
            try:
                return json.loads(t)
            except json.JSONDecodeError:
                pass

            # LLMs often return JSON with literal newlines inside strings
            # Try to fix by escaping newlines within string values
            try:
                import re
                # Replace literal newlines that are inside strings with escaped newlines
                # This regex finds strings and escapes newlines within them
                fixed = re.sub(
                    r'("(?:[^"\\]|\\.)*")',
                    lambda m: m.group(0).replace('\n', '\\n').replace('\r', '\\r'),
                    t
                )
                return json.loads(fixed)
            except (json.JSONDecodeError, Exception):
                pass

        return {}


class Agent(ABC, Generic[StateT, ResultT]):
    """
    Base class for all agents.

    Agents are stateful, can run autonomously, and can be composed.
    """

    name: str = "base_agent"
    description: str = "Base agent class"

    def __init__(self, ai_client: Optional[AIClient] = None):
        self.ai = ai_client or AIClient()

    @abstractmethod
    def create_initial_state(self, **kwargs) -> StateT:
        """Create the initial state for this agent."""
        pass

    @abstractmethod
    async def run(self, state: StateT, **kwargs) -> AgentResult[ResultT]:
        """
        Execute one iteration of the agent.

        For autonomous agents, this may be called multiple times
        until should_continue is False or max_iterations is reached.
        """
        pass

    async def run_until_complete(
        self,
        state: StateT,
        **kwargs
    ) -> tuple[AgentResult[ResultT], StateT]:
        """
        Run the agent autonomously until completion or failure.
        """
        while state.can_continue():
            state.iteration += 1
            state.status = AgentStatus.RUNNING
            state.update()

            try:
                result = await self.run(state, **kwargs)

                if result.success and not result.should_continue:
                    state.status = AgentStatus.COMPLETED
                    return result, state

                if not result.success:
                    state.add_error(result.error or "Unknown error")
                    if not result.should_continue:
                        state.status = AgentStatus.FAILED
                        return result, state

                # Continue to next iteration

            except Exception as exc:
                state.add_error(str(exc))
                state.status = AgentStatus.FAILED
                return AgentResult(success=False, error=str(exc)), state

        # Max iterations reached
        state.status = AgentStatus.FAILED
        return AgentResult(
            success=False,
            error=f"Max iterations ({state.max_iterations}) reached"
        ), state
