"""
Integration layer between FastAPI endpoints and the agent framework.

This module provides functions that bridge the existing API contracts
with the new agent-based implementation.
"""

from __future__ import annotations

import asyncio
import json
import os
from typing import Optional

import yaml

from .base import AIClient
from .orchestrator import AgentOrchestrator, OrchestratorState, ProjectPhase


# Cache for orchestrator state (in production, use Redis or DynamoDB)
_STATE_CACHE: dict[str, dict] = {}


def _get_state(project_id: str) -> OrchestratorState:
    """Get or create orchestrator state for a project."""
    if project_id in _STATE_CACHE:
        return OrchestratorState.from_dict(_STATE_CACHE[project_id])
    return OrchestratorState(project_id=project_id)


def _save_state(state: OrchestratorState) -> None:
    """Persist orchestrator state."""
    _STATE_CACHE[state.project_id] = state.to_dict()


def _get_template_context(template_id: str, templates_dir) -> str:
    """Load template context for prompts."""
    try:
        path = templates_dir / template_id / "template.yaml"
        if path.exists():
            with path.open("r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                return yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    except Exception:
        pass
    return "Production SaaS template with Next.js 15, Python Lambda, DynamoDB, Clerk auth, Stripe billing."


def _get_modules_context(modules_dir) -> str:
    """Load available modules context for prompts."""
    if not modules_dir.exists():
        return "Available modules: auth-clerk, billing-stripe"

    modules = []
    for child in sorted(modules_dir.iterdir()):
        if not child.is_dir():
            continue
        module_path = child / "module.yaml"
        if module_path.exists():
            try:
                with module_path.open("r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
                    meta = data.get("module", {})
                    modules.append({
                        "id": meta.get("id", child.name),
                        "name": meta.get("name", child.name),
                        "description": meta.get("description", ""),
                    })
            except Exception:
                pass

    if modules:
        return "Available modules:\n" + yaml.safe_dump(modules, sort_keys=False, allow_unicode=True)
    return "Available modules: auth-clerk, billing-stripe"


async def process_chat_with_agents(
    project_id: str,
    project_name: str,
    template_id: str,
    message: str,
    history: list[dict],
    user_id: str,
    auto_preview: bool,
    templates_dir,
    modules_dir,
) -> dict:
    """
    Process a chat message using the agent framework.
    Returns a response compatible with ProjectChatResponse.
    """
    # Get or create state
    state = _get_state(project_id)

    # Reconstruct history from request if state is empty
    if not state.chat_history and history:
        state.chat_history = [
            {"role": h.role if hasattr(h, "role") else h.get("role", "user"),
             "content": h.content if hasattr(h, "content") else h.get("content", "")}
            for h in history
        ]

    # Build contexts
    template_context = _get_template_context(template_id, templates_dir)
    modules_context = _get_modules_context(modules_dir)

    # Create orchestrator
    orchestrator = AgentOrchestrator(
        ai_client=AIClient(),
        template_context=template_context,
        modules_context=modules_context,
    )

    # Process chat
    response, state = await orchestrator.process_chat(
        state=state,
        message=message,
        user_id=user_id,
        project_name=project_name,
        template_id=template_id,
        auto_generate_spec=True,
    )

    # Save state
    _save_state(state)

    # Build response compatible with existing API
    suggested_action = response.suggested_action
    if auto_preview and response.readiness_score >= 80:
        suggested_action = "build_preview"

    # Generate spec markdown for backwards compatibility
    spec_markdown = None
    if state.spec_yaml:
        spec_markdown = _spec_yaml_to_markdown(state.spec_yaml)

    return {
        "assistant": {"role": "assistant", "content": response.message},
        "followups": response.followups,
        "suggested_action": suggested_action,
        "plan": f"Phase: {state.phase.value}\nReadiness: {state.readiness_score}%",
        "spec_yaml": state.spec_yaml,
        "spec_markdown": spec_markdown,
        "phase": state.phase.value,
        "readiness_score": state.readiness_score,
    }


async def generate_code_with_agents(
    project_id: str,
    project_name: str,
    template_id: str,
    spec_yaml: str,
    user_id: str,
    skeleton_manifest: list[str],
    templates_dir,
    modules_dir,
) -> dict:
    """
    Generate code using the agent framework.
    Returns file changes and validation status.
    """
    # Get state
    state = _get_state(project_id)

    # Ensure spec is set
    if spec_yaml and not state.spec_yaml:
        state.spec_yaml = spec_yaml

    if not state.spec_yaml:
        return {
            "success": False,
            "error": "No specification available. Complete chat first.",
            "files": [],
            "validated": False,
        }

    # Build contexts
    template_context = _get_template_context(template_id, templates_dir)
    modules_context = _get_modules_context(modules_dir)

    # Create orchestrator
    orchestrator = AgentOrchestrator(
        ai_client=AIClient(),
        template_context=template_context,
        modules_context=modules_context,
        skeleton_manifest=skeleton_manifest,
    )

    # Generate code with validation
    response, state = await orchestrator.generate_code(
        state=state,
        user_id=user_id,
        project_name=project_name,
        template_id=template_id,
    )

    # Save state
    _save_state(state)

    if response.success:
        # Get the unified diff for CodeBuild
        patch_diff = orchestrator.get_patch_diff(state)

        return {
            "success": True,
            "files": state.file_changes,
            "files_count": response.files_generated,
            "validated": response.validation_passed,
            "patch_diff": patch_diff,
            "phase": state.phase.value,
        }
    else:
        return {
            "success": False,
            "error": "; ".join(response.errors),
            "files": state.file_changes,
            "validated": False,
            "phase": state.phase.value,
        }


def _spec_yaml_to_markdown(spec_yaml: str) -> str:
    """Convert spec YAML to readable markdown."""
    try:
        parsed = yaml.safe_load(spec_yaml)
        if not isinstance(parsed, dict):
            return f"```yaml\n{spec_yaml}\n```"

        lines = []
        for key, value in parsed.items():
            title = str(key).replace("_", " ").title()
            lines.append(f"## {title}")

            if isinstance(value, str):
                lines.append(value.strip())
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        inner = ", ".join(f"{k}: {v}" for k, v in item.items())
                        lines.append(f"- {inner}")
                    else:
                        lines.append(f"- {item}")
            elif isinstance(value, dict):
                for sub_key, sub_val in value.items():
                    lines.append(f"- {sub_key}: {sub_val}")
            else:
                lines.append(f"- {value}")
            lines.append("")

        return "\n".join(lines).strip()
    except Exception:
        return f"```yaml\n{spec_yaml}\n```"


def run_async(coro):
    """Run an async function from sync context."""
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    if loop.is_running():
        # We're in an async context already (e.g., FastAPI with async)
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()
    else:
        return loop.run_until_complete(coro)
