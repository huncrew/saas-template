"""
SpecGeneratorAgent - Generates structured specifications from conversation.

This agent:
- Takes conversation history and extracted requirements
- Generates a detailed YAML specification
- Ensures spec is complete and actionable for code generation
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import yaml

from .base import Agent, AgentState, AgentResult, AIClient


@dataclass
class SpecState(AgentState):
    """State for the spec generator agent."""
    conversation_summary: str = ""
    extracted_requirements: dict = field(default_factory=dict)
    project_name: str = ""
    template_id: str = ""
    template_context: str = ""
    modules_context: str = ""
    generated_spec: Optional[str] = None  # YAML string
    spec_review_feedback: Optional[str] = None


@dataclass
class SpecResult:
    """Result from spec generation."""
    spec_yaml: str
    spec_summary: str  # Human-readable summary
    modules_selected: list[str]
    features_count: int
    ready_for_generation: bool


SPEC_SYSTEM_PROMPT = """You are an expert product engineer generating minimal, buildable specs.

## Your Task
Generate a YAML specification that can be built QUICKLY. Prefer simplicity over completeness.

## CRITICAL: Default to MINIMAL Preview Mode
Unless the user EXPLICITLY requests these, DO NOT include them:
- modules: [] (NO auth-clerk, NO billing-stripe unless user says "with login" or "with payments")
- api_endpoints: [] (NO backend unless user says "save to database" or "persist")
- data_entities: [] (NO database schemas)

For simple apps: Use React useState for local state. That's it!

## Template Context
{template_context}

## Available Modules (only if EXPLICITLY requested)
{modules_context}

## Spec Format

Required sections:
1. **goal**: One sentence - what does this app do?
2. **target_users**: Who uses it? (1-2 bullet points)
3. **modules**: [] unless auth/payments explicitly requested
4. **features**: List of features, each with:
   - id, name, description
   - ui_components: React components needed
5. **ui_pages**: Just the pages needed:
   - path: /
   - name: Page name
   - components: What's on this page

Optional sections (ONLY if user explicitly asks):
- api_endpoints: Only if persistence/backend requested
- data_entities: Only if database requested
- integrations: Only if external services requested

## Examples

User says "simple todo app":
```yaml
goal: A todo app where users manage tasks
target_users:
  - People who want to track tasks
modules: []
features:
  - id: task-management
    name: Task Management
    description: Add, complete, and delete tasks
    ui_components:
      - TaskInput
      - TaskList
      - TaskItem
ui_pages:
  - path: /
    name: Task Dashboard
    components:
      - TaskInput
      - TaskList
```

User says "todo app with login and cloud storage":
```yaml
goal: A todo app with user accounts and cloud storage
target_users:
  - Users who want tasks synced across devices
modules:
  - id: auth-clerk
features:
  - id: task-crud
    name: Task Management
    description: Create, read, update, delete tasks
    ui_components:
      - TaskInput
      - TaskList
    api_endpoints:
      - POST /api/tasks
      - GET /api/tasks
      - PUT /api/tasks/{id}
      - DELETE /api/tasks/{id}
api_endpoints:
  - method: POST
    path: /api/tasks
    description: Create task
data_entities:
  - name: Task
    fields:
      - name: id
        type: string
      - name: title
        type: string
      - name: completed
        type: boolean
ui_pages:
  - path: /
    name: Dashboard
    components:
      - TaskInput
      - TaskList
```

## Output
Respond with ONLY valid YAML. Start with "goal:"."""


class SpecGeneratorAgent(Agent[SpecState, SpecResult]):
    """
    Agent that generates structured specifications from conversation.
    """

    name = "spec_generator"
    description = "Generates detailed YAML specifications"

    def create_initial_state(
        self,
        conversation_summary: str = "",
        extracted_requirements: Optional[dict] = None,
        project_name: str = "",
        template_id: str = "",
        template_context: str = "",
        modules_context: str = "",
        **kwargs
    ) -> SpecState:
        return SpecState(
            conversation_summary=conversation_summary,
            extracted_requirements=extracted_requirements or {},
            project_name=project_name,
            template_id=template_id,
            template_context=template_context,
            modules_context=modules_context,
            max_iterations=3,  # Allow a few retries
        )

    def _build_prompt(self, state: SpecState) -> str:
        requirements_text = ""
        if state.extracted_requirements:
            requirements_text = yaml.safe_dump(
                state.extracted_requirements,
                sort_keys=False,
                allow_unicode=True
            )

        prompt = f"""## Project: {state.project_name}
## Template: {state.template_id}

## Conversation Summary:
{state.conversation_summary}

## Extracted Requirements:
{requirements_text}

Generate the complete YAML specification now."""

        if state.spec_review_feedback:
            prompt += f"""

## Previous Attempt Feedback:
{state.spec_review_feedback}

Please fix the issues and regenerate the specification."""

        return prompt

    def _validate_spec(self, spec_yaml: str) -> tuple[bool, list[str]]:
        """Validate that the spec has all required sections."""
        required_sections = [
            "goal",
            "target_users",
            "features",
            "ui_pages",
            "acceptance_criteria",
        ]

        try:
            parsed = yaml.safe_load(spec_yaml)
            if not isinstance(parsed, dict):
                return False, ["Spec is not a valid YAML dictionary"]

            missing = [s for s in required_sections if s not in parsed]
            if missing:
                return False, [f"Missing required sections: {', '.join(missing)}"]

            # Check features have required fields
            features = parsed.get("features", [])
            if not features:
                return False, ["No features defined"]

            for i, feature in enumerate(features):
                if not isinstance(feature, dict):
                    continue
                if "id" not in feature or "name" not in feature:
                    return False, [f"Feature {i} missing id or name"]

            return True, []

        except yaml.YAMLError as e:
            return False, [f"Invalid YAML: {e}"]

    def _extract_modules(self, spec_yaml: str) -> list[str]:
        """Extract module IDs from the spec."""
        try:
            parsed = yaml.safe_load(spec_yaml)
            modules = parsed.get("modules", [])
            if isinstance(modules, list):
                return [
                    m if isinstance(m, str) else m.get("id", "")
                    for m in modules
                    if m
                ]
        except Exception:
            pass
        return []

    def _count_features(self, spec_yaml: str) -> int:
        """Count features in the spec."""
        try:
            parsed = yaml.safe_load(spec_yaml)
            features = parsed.get("features", [])
            return len(features) if isinstance(features, list) else 0
        except Exception:
            return 0

    def _generate_summary(self, spec_yaml: str) -> str:
        """Generate a human-readable summary of the spec."""
        try:
            parsed = yaml.safe_load(spec_yaml)
            goal = parsed.get("goal", "Build an application")
            features = parsed.get("features", [])
            feature_names = [f.get("name", "Unnamed") for f in features[:5] if isinstance(f, dict)]

            summary = f"**Goal:** {goal}\n\n"
            summary += f"**Features ({len(features)}):**\n"
            for name in feature_names:
                summary += f"- {name}\n"
            if len(features) > 5:
                summary += f"- ...and {len(features) - 5} more\n"

            return summary
        except Exception:
            return "Specification generated"

    async def run(
        self,
        state: SpecState,
        user_id: str = "",
        **kwargs
    ) -> AgentResult[SpecResult]:
        """
        Generate a specification from conversation context.
        """
        system = SPEC_SYSTEM_PROMPT.format(
            template_context=state.template_context or "SaaS template with Next.js and Python Lambda",
            modules_context=state.modules_context or "auth-clerk, billing-stripe",
        )

        prompt = self._build_prompt(state)

        try:
            response = self.ai.generate(
                prompt=prompt,
                user_id=user_id,
                system=system,
                temperature=0.2,
                max_tokens=4000,
            )

            # Clean up response (remove any markdown fences)
            spec_yaml = response.strip()
            if spec_yaml.startswith("```"):
                lines = spec_yaml.split("\n")
                lines = lines[1:]  # Remove opening fence
                if lines and lines[-1].strip() == "```":
                    lines = lines[:-1]  # Remove closing fence
                spec_yaml = "\n".join(lines)

            # Validate
            is_valid, errors = self._validate_spec(spec_yaml)

            if not is_valid:
                state.spec_review_feedback = "\n".join(errors)
                state.add_error(f"Validation failed: {errors}")
                return AgentResult(
                    success=False,
                    error=f"Spec validation failed: {errors}",
                    should_continue=True,  # Retry
                )

            # Success
            state.generated_spec = spec_yaml
            state.update()

            result = SpecResult(
                spec_yaml=spec_yaml,
                spec_summary=self._generate_summary(spec_yaml),
                modules_selected=self._extract_modules(spec_yaml),
                features_count=self._count_features(spec_yaml),
                ready_for_generation=True,
            )

            return AgentResult(
                success=True,
                data=result,
                should_continue=False,
            )

        except Exception as exc:
            state.add_error(str(exc))
            return AgentResult(
                success=False,
                error=str(exc),
                should_continue=state.iteration < state.max_iterations,
            )
