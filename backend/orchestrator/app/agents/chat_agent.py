"""
ChatAgent - Handles conversational requirements gathering.

This agent:
- Maintains conversation context
- Asks clarifying questions
- Determines when enough info is gathered to generate a spec
- Extracts structured requirements from conversation
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .base import Agent, AgentState, AgentResult, AgentStatus, AIClient


@dataclass
class ChatMessage:
    role: str  # "user" or "assistant"
    content: str


@dataclass
class ChatState(AgentState):
    """State for the chat agent."""
    history: list[ChatMessage] = field(default_factory=list)
    readiness_score: int = 0  # 0-100, how ready we are to generate spec
    extracted_requirements: dict = field(default_factory=dict)
    followup_questions: list[str] = field(default_factory=list)
    project_name: str = ""
    template_id: str = ""
    template_context: str = ""
    modules_context: str = ""


@dataclass
class ChatResult:
    """Result from a chat turn."""
    assistant_message: str
    followup_questions: list[str]
    readiness_score: int
    suggested_action: str  # "continue_chat", "generate_spec", "build_preview"
    extracted_requirements: Optional[dict] = None


SYSTEM_PROMPT_TEMPLATE = """You are an expert SaaS application architect helping design and build production-ready applications.

## Your Role
You're having a conversation to understand what the user wants to build. Be conversational, helpful, and guide them toward a clear, buildable specification.

## Project Context
- Project Name: {project_name}
- Template: {template_id}

## Template Foundation
{template_context}

## Available Integrations
{modules_context}

## Your Objectives
1. Understand the CORE problem they're solving
2. Identify the primary user persona(s)
3. Clarify the 2-3 most important workflows/features
4. Understand data requirements (what needs to be stored/managed)
5. Identify required integrations (auth, payments, email, etc.)

## Conversation Guidelines
- Keep responses concise (2-4 sentences max unless explaining something)
- Ask ONE focused question at a time when you need clarity
- Don't overwhelm with technical details - keep it accessible
- When you have enough info, suggest moving to building

## Response Format
You MUST respond with valid JSON in this exact format:
{{
    "message": "Your conversational response to the user",
    "followups": ["Optional question 1", "Optional question 2"],
    "readiness_score": 0-100,
    "suggested_action": "continue_chat" | "generate_spec" | "build_preview",
    "requirements": {{
        "core_problem": "What problem this solves",
        "users": ["User type 1", "User type 2"],
        "features": ["Feature 1", "Feature 2"],
        "data_models": ["Model 1", "Model 2"],
        "integrations": ["auth-clerk", "billing-stripe"]
    }}
}}

## Readiness Score Guidelines - BE AGGRESSIVE
- 0-30: Need to understand what they're building
- 30-60: Have basic idea, need 1-2 more details
- 60-80: Have enough to build something useful - CONSIDER PROCEEDING
- 80-100: Ready to generate spec and build - PROCEED NOW

IMPORTANT: Don't be too conservative! If user has given you a clear app idea with
even basic requirements, move readiness to 70+. After 2-3 exchanges, you should
usually be at 80+. Users want to BUILD, not answer endless questions.

## CRITICAL: Detecting User Intent to Proceed
Watch for these PROCEED SIGNALS that mean the user wants to move forward:
- "get started", "let's go", "start building", "build it", "ok", "yes", "proceed"
- "sounds good", "that's it", "let's do it", "make it", "create it"
- Simple affirmative responses when you've asked if they're ready

When you detect a proceed signal AND readiness >= 40%, immediately:
1. Set suggested_action to "generate_spec"
2. Boost readiness_score to 85+
3. Acknowledge you're proceeding to build

DO NOT keep asking questions if the user signals they want to proceed.
If in doubt about requirements, use sensible defaults and proceed."""


class ChatAgent(Agent[ChatState, ChatResult]):
    """
    Agent that handles conversational requirements gathering.
    """

    name = "chat_agent"
    description = "Gathers requirements through conversation"

    def __init__(self, ai_client: Optional[AIClient] = None):
        super().__init__(ai_client)

    def create_initial_state(
        self,
        project_name: str = "",
        template_id: str = "",
        template_context: str = "",
        modules_context: str = "",
        **kwargs
    ) -> ChatState:
        return ChatState(
            project_name=project_name,
            template_id=template_id,
            template_context=template_context,
            modules_context=modules_context,
            max_iterations=50,  # Allow many chat turns
        )

    def _build_system_prompt(self, state: ChatState) -> str:
        return SYSTEM_PROMPT_TEMPLATE.format(
            project_name=state.project_name or "Untitled Project",
            template_id=state.template_id or "saas-crud",
            template_context=state.template_context or "Production SaaS template with Next.js, Python Lambda, DynamoDB",
            modules_context=state.modules_context or "auth-clerk, billing-stripe available",
        )

    def _format_history(self, history: list[ChatMessage]) -> str:
        if not history:
            return ""

        lines = []
        for msg in history[-10:]:  # Keep last 10 turns for context
            role = "User" if msg.role == "user" else "Assistant"
            lines.append(f"{role}: {msg.content}")

        return "\n".join(lines)

    def _is_proceed_signal(self, message: str, readiness: int) -> bool:
        """Detect if user wants to proceed/start building."""
        msg_lower = message.lower().strip()

        # Strong proceed signals - user explicitly wants to move forward
        strong_signals = [
            "get started", "let's go", "start building", "build it",
            "proceed", "make it", "create it", "let's do it",
            "just build", "go ahead", "start please", "begin",
            "ok build", "yes build", "do it", "ship it",
            "build this", "build that", "build now", "ready to build",
            "let's build", "start now", "generate", "create",
            "i want to build", "build please", "can you build",
        ]

        # Weak proceed signals - affirmative responses
        weak_signals = [
            "ok", "yes", "sure", "yep", "yeah", "sounds good", "that's it", "perfect",
            "that works", "good", "great", "fine", "cool", "nice", "alright",
            "exactly", "correct", "right", "yup", "uh huh",
        ]

        # Check for strong signals (any readiness level)
        for signal in strong_signals:
            if signal in msg_lower:
                return True

        # Check for weak signals (only if readiness >= 40%)
        if readiness >= 40:
            # Short affirmative responses
            if msg_lower in weak_signals or len(msg_lower) < 15:
                for signal in weak_signals:
                    if signal in msg_lower:
                        return True

        return False

    async def run(
        self,
        state: ChatState,
        user_message: str = "",
        user_id: str = "",
        **kwargs
    ) -> AgentResult[ChatResult]:
        """
        Process a single chat turn.
        """
        if not user_message:
            return AgentResult(
                success=False,
                error="No user message provided"
            )

        # Check for proceed signal BEFORE calling AI
        is_proceed = self._is_proceed_signal(user_message, state.readiness_score)

        # Add user message to history
        state.history.append(ChatMessage(role="user", content=user_message))

        # Build prompt
        system = self._build_system_prompt(state)
        history_text = self._format_history(state.history[:-1])  # Exclude current message

        prompt = f"""Previous conversation:
{history_text}

User's latest message: {user_message}

Respond with JSON as specified in your instructions."""

        try:
            response = self.ai.generate_json(
                prompt=prompt,
                user_id=user_id,
                system=system,
                temperature=0.4,
                max_tokens=2000,
            )

            # Extract response components
            assistant_message = response.get("message", "I'm here to help you build your app. What would you like to create?")
            followups = response.get("followups", [])
            readiness = response.get("readiness_score", state.readiness_score)
            suggested_action = response.get("suggested_action", "continue_chat")
            requirements = response.get("requirements", {})

            # OVERRIDE: If user signaled proceed, force spec generation
            # Be aggressive - if user says "get started", proceed with what we have
            if is_proceed and len(state.history) >= 2:  # At least one prior exchange
                suggested_action = "generate_spec"
                readiness = max(readiness, 85)
                assistant_message = "Let me start building that for you now."
                followups = []  # Clear follow-ups since we're proceeding

            # Update state
            state.history.append(ChatMessage(role="assistant", content=assistant_message))
            state.readiness_score = readiness
            state.followup_questions = followups
            if requirements:
                state.extracted_requirements.update(requirements)
            state.update()

            result = ChatResult(
                assistant_message=assistant_message,
                followup_questions=followups,
                readiness_score=readiness,
                suggested_action=suggested_action,
                extracted_requirements=requirements,
            )

            # Determine if we should continue
            should_continue = suggested_action == "continue_chat"

            return AgentResult(
                success=True,
                data=result,
                should_continue=should_continue,
                next_action=suggested_action,
            )

        except Exception as exc:
            # Fallback response on error
            fallback_msg = "I'm having trouble processing that. Could you rephrase what you're looking to build?"
            state.history.append(ChatMessage(role="assistant", content=fallback_msg))
            state.add_error(str(exc))

            return AgentResult(
                success=False,
                error=str(exc),
                data=ChatResult(
                    assistant_message=fallback_msg,
                    followup_questions=["What's the main problem you're trying to solve?"],
                    readiness_score=state.readiness_score,
                    suggested_action="continue_chat",
                ),
                should_continue=True,  # Keep going despite error
            )

    def get_conversation_summary(self, state: ChatState) -> str:
        """Get a summary of the conversation for spec generation."""
        if not state.history:
            return ""

        return "\n".join([
            f"{'User' if m.role == 'user' else 'Assistant'}: {m.content}"
            for m in state.history
        ])
