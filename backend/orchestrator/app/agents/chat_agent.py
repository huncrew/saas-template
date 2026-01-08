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

## Readiness Score Guidelines
- 0-30: Just started, need core problem and user understanding
- 30-50: Have basic understanding, need feature details
- 50-70: Have features, need data model and integration clarity
- 70-85: Have most info, confirming final details
- 85-100: Ready to generate spec and build

Only suggest "generate_spec" when readiness_score >= 80.
Only suggest "build_preview" if user explicitly asks to build/preview."""


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
