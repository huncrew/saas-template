"""
Base Agent class and core types for the agent framework.
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Generic, Optional, TypeVar
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
import os


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
    Client for calling AI models via the backend Lambda.
    Abstracts away the HTTP details.
    """

    def __init__(self, backend_url: Optional[str] = None):
        self.backend_url = backend_url or os.getenv("BACKEND_API_URL", "").rstrip("/")

    def generate(
        self,
        prompt: str,
        user_id: str,
        system: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 4096,
    ) -> str:
        """
        Call the AI generation endpoint.
        Returns the raw text response.
        """
        if not self.backend_url:
            raise RuntimeError("BACKEND_API_URL not configured")

        # Build the full prompt with system message if provided
        full_prompt = prompt
        if system:
            full_prompt = f"{system}\n\n---\n\n{prompt}"

        payload = {
            "userId": user_id,
            "prompt": full_prompt,
            "temperature": temperature,
            "maxTokens": max_tokens,
        }

        data = json.dumps(payload).encode("utf-8")
        req = urlrequest.Request(
            f"{self.backend_url}/ai/generate",
            method="POST",
            data=data,
            headers={"Content-Type": "application/json"},
        )

        try:
            with urlrequest.urlopen(req, timeout=120) as resp:
                body = resp.read().decode("utf-8")
        except HTTPError as exc:
            err_body = exc.read().decode("utf-8") if hasattr(exc, "read") else ""
            raise RuntimeError(f"AI generate failed: {exc.code} {err_body}") from exc
        except URLError as exc:
            raise RuntimeError(f"AI generate failed: {exc}") from exc

        parsed = json.loads(body) if body else {}
        if not parsed.get("success"):
            raise RuntimeError(parsed.get("error") or "AI generate failed")

        return (parsed.get("data") or {}).get("response") or ""

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
