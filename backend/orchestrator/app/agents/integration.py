"""
Integration layer between FastAPI endpoints and the agent framework.

This module provides functions that bridge the existing API contracts
with the new agent-based implementation.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path
from typing import Optional

import yaml

logger = logging.getLogger(__name__)

from app.repo import get_repo
from .base import AIClient
from .orchestrator import AgentOrchestrator, OrchestratorState, ProjectPhase
from .prebuild_validator import validate_generated_files, ValidationResult
from .validator_agent import ValidatorAgent, ValidationResult as ValidatorResult
from .code_agent import FileChange
from .diagram_generator import generate_architecture_diagram, generate_entity_diagram


def _use_agentic_coder() -> bool:
    """Check if agentic coder is enabled. Defaults to enabled (set USE_AGENTIC_CODER=0 to disable)."""
    return os.getenv("USE_AGENTIC_CODER", "1").lower() in ("1", "true", "yes")


# Cache for orchestrator state (in production, use Redis or DynamoDB)
_STATE_CACHE: dict[str, dict] = {}


async def run_compile_validation(
    files: list[dict],
    skeleton_path: Optional[str] = None,
) -> dict:
    """
    Run REAL compile validation: npm ci && npm run build.

    This catches all TypeScript errors, missing exports, type mismatches, etc.
    Much more thorough than the lightweight Python-based prebuild validation.

    Args:
        files: List of file dicts with 'path' and 'content'
        skeleton_path: Path to template skeleton (with package.json, etc.)

    Returns:
        dict with 'valid', 'errors', 'build_output'
    """
    # Convert to FileChange objects
    file_changes = [
        FileChange(
            path=f.get("path", ""),
            content=f.get("content", ""),
            action="create"
        )
        for f in files
        if f.get("path") and f.get("content")
    ]

    if not file_changes:
        return {"valid": True, "errors": [], "build_output": ""}

    validator = ValidatorAgent()
    try:
        state = validator.create_initial_state(
            file_changes=file_changes,
            skeleton_path=skeleton_path,
            run_full_build=True,  # This is the key - runs npm ci && npm run build
        )

        result = await validator.run(state)

        if result.success and result.data:
            validation_result = result.data
            errors = [
                {
                    "file": e.file,
                    "line": e.line,
                    "type": "COMPILE_ERROR",
                    "message": e.message,
                    "severity": e.severity,
                }
                for e in validation_result.errors
            ]

            return {
                "valid": validation_result.is_valid,
                "errors": errors,
                "error_count": validation_result.error_count,
                "warning_count": validation_result.warning_count,
                "build_output": state.build_output,
                "summary": validation_result.summary,
            }
        else:
            return {
                "valid": False,
                "errors": [{"file": "system", "message": result.error or "Validation failed"}],
                "build_output": "",
            }
    finally:
        validator.cleanup()


def _get_state(project_id: str, user_id: str) -> OrchestratorState:
    """Get or create orchestrator state for a project.

    We keep a hot in-process cache for performance, but we *also* persist
    state on the Project record so iterative development survives restarts.
    """
    if project_id in _STATE_CACHE:
        try:
            return OrchestratorState.from_dict(_STATE_CACHE[project_id])
        except Exception:
            pass

    # Durable fallback: load from the Project record (DynamoRepo or InMemoryRepo).
    try:
        repo = get_repo()
        project = repo.get_project(user_id, project_id)
        if project and isinstance(project.agent_state, dict) and project.agent_state.get("project_id") == project_id:
            state = OrchestratorState.from_dict(project.agent_state)
            _STATE_CACHE[project_id] = state.to_dict()
            return state
    except Exception:
        pass

    return OrchestratorState(project_id=project_id)


def _save_state(state: OrchestratorState, user_id: str) -> None:
    """Persist orchestrator state (cache + durable project record)."""
    _STATE_CACHE[state.project_id] = state.to_dict()

    # Best-effort durability: store on the Project record (schemaless field).
    try:
        repo = get_repo()
        project = repo.get_project(user_id, state.project_id)
        if project:
            project.agent_state = state.to_dict()
            repo.put_project(user_id, project)
    except Exception:
        # Never break chat/codegen because persistence failed.
        pass


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
    state = _get_state(project_id, user_id=user_id)

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
    template_path = str(templates_dir / template_id) if templates_dir else ""

    # Create orchestrator
    orchestrator = AgentOrchestrator(
        ai_client=AIClient(),
        template_context=template_context,
        modules_context=modules_context,
        template_path=template_path,
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
    _save_state(state, user_id=user_id)

    # Build response compatible with existing API
    # Map agent actions to API-expected values
    action_map = {
        "continue_chat": "ask_followups",
        "generate_spec": "build_preview",  # Spec was generated, proceed to build
        "build_preview": "build_preview",
    }
    suggested_action = action_map.get(response.suggested_action, "ask_followups")

    # If spec exists and readiness is decent, suggest build (be aggressive)
    if state.spec_yaml and response.readiness_score >= 65:
        suggested_action = "build_preview"
    elif auto_preview and response.readiness_score >= 70:
        suggested_action = "build_preview"

    # Generate spec markdown for backwards compatibility
    spec_markdown = None
    architecture_diagram = None
    entity_diagram = None
    if state.spec_yaml:
        spec_markdown = _spec_yaml_to_markdown(state.spec_yaml)
        # Generate Mermaid diagrams from spec
        architecture_diagram = generate_architecture_diagram(state.spec_yaml)
        entity_diagram = generate_entity_diagram(state.spec_yaml)

    return {
        "assistant": {"role": "assistant", "content": response.message},
        "followups": response.followups,
        "suggested_action": suggested_action,
        "plan": f"Phase: {state.phase.value}\nReadiness: {state.readiness_score}%",
        "spec_yaml": state.spec_yaml,
        "spec_markdown": spec_markdown,
        "phase": state.phase.value,
        "readiness_score": state.readiness_score,
        "architecture_diagram": architecture_diagram,
        "entity_diagram": entity_diagram,
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
    additional_instructions: str = "",
) -> dict:
    """
    Generate code using the agent framework.
    Returns file changes and validation status.
    """
    # Get state
    state = _get_state(project_id, user_id=user_id)

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
    template_path = str(templates_dir / template_id) if templates_dir else ""

    # Create orchestrator
    orchestrator = AgentOrchestrator(
        ai_client=AIClient(),
        template_context=template_context,
        modules_context=modules_context,
        skeleton_manifest=skeleton_manifest,
        template_path=template_path,
    )

    # Generate code with validation
    response, state = await orchestrator.generate_code(
        state=state,
        user_id=user_id,
        project_name=project_name,
        template_id=template_id,
        additional_instructions=additional_instructions,
    )

    # Save state
    _save_state(state, user_id=user_id)

    if response.success:
        # Run pre-build validation BEFORE considering it successful
        files_for_validation = [
            {"path": f.path if hasattr(f, 'path') else f.get('path', ''),
             "content": f.content if hasattr(f, 'content') else f.get('content', '')}
            for f in state.file_changes
        ]
        validation_result = validate_generated_files(files_for_validation)

        if not validation_result.valid:
            # Pre-build validation failed - return errors for retry
            error_details = []
            for err in validation_result.errors[:5]:
                error_details.append(f"[{err.error_type}] {err.file_path}:{err.line_number or '?'} - {err.message}")

            return {
                "success": False,
                "error": "Pre-build validation failed",
                "validation_errors": [
                    {
                        "file": e.file_path,
                        "line": e.line_number,
                        "type": e.error_type,
                        "message": e.message,
                        "suggestion": e.suggestion,
                    }
                    for e in validation_result.errors
                ],
                "files": state.file_changes,
                "files_count": response.files_generated,
                "validated": False,
                "prebuild_failed": True,
                "prebuild_error_string": validation_result.to_error_string(),
                "phase": state.phase.value,
            }

        # Get the unified diff for CodeBuild
        patch_diff = orchestrator.get_patch_diff(state)

        return {
            "success": True,
            "files": state.file_changes,
            "files_count": response.files_generated,
            "validated": response.validation_passed,
            "security_passed": response.security_passed,
            "security_findings": response.security_findings,
            "patch_diff": patch_diff,
            "phase": state.phase.value,
            "prebuild_passed": True,
        }
    else:
        return {
            "success": False,
            "error": "; ".join(response.errors),
            "files": state.file_changes,
            "validated": False,
            "security_passed": False,
            "security_findings": [],
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


async def generate_code_agentic(
    project_id: str,
    project_name: str,
    template_id: str,
    spec_yaml: str,
    user_id: str,
    templates_dir,
    run_compile: bool = True,
) -> dict:
    """
    Generate code using the agentic coder with tool calling.

    This is the "Cursor/Claude Code"-like experience where the model can:
    - Explore the existing codebase
    - Read files to understand what's available
    - Write files incrementally
    - Fix errors based on compiler output

    Args:
        project_id: Project ID
        project_name: Name of the project
        template_id: Template to use
        spec_yaml: Specification YAML
        user_id: User ID
        templates_dir: Path to templates directory
        run_compile: Whether to run compile validation

    Returns:
        Dict with success, files, and status
    """
    from .agentic_coder import run_agentic_generation
    from .code_agent import FileChange

    # CRITICAL: Always use base-skeleton - it has the actual frontend code with UI components
    # The template_id specific configs are in template.yaml but the code is in base-skeleton
    template_path = str(templates_dir / "base-skeleton") if templates_dir else ""
    logger.info(f"[generate_code_agentic] Using template_path={template_path}")

    # Get model ID from environment
    model_id = os.getenv("BEDROCK_MODEL_ID") or os.getenv("AGENTIC_MODEL_ID")

    result = await run_agentic_generation(
        spec_yaml=spec_yaml,
        project_name=project_name,
        template_path=template_path,
        user_id=user_id,
        model_id=model_id,
        run_compile=run_compile,
    )

    # Convert changed files map to the manifest format expected downstream.
    # NOTE: We only ship files the agent actually wrote/changed (not the whole template).
    files_manifest = [
        {"path": path, "content": content or "", "action": "create"}
        for path, content in (result.files or {}).items()
        if path
    ]

    if result.success:
        # Check if validation passed - look for "passed" or "succeeded" in compile output
        compile_lower = result.compile_output.lower() if result.compile_output else ""
        validation_passed = "passed" in compile_lower or "succeeded" in compile_lower

        return {
            "success": True,
            "files": files_manifest,
            "files_count": len(files_manifest),
            "validated": validation_passed,
            "summary": result.summary,
            "iterations": result.iterations,
            "compile_output": result.compile_output,
            "agentic": True,
        }
    else:
        return {
            "success": False,
            "error": result.error or "Agentic generation failed",
            "files": files_manifest,
            "validated": False,
            "iterations": result.iterations,
            "compile_output": result.compile_output,
            "agentic": True,
        }


async def smart_generate_code(
    project_id: str,
    project_name: str,
    template_id: str,
    spec_yaml: str,
    user_id: str,
    skeleton_manifest: list[str],
    templates_dir,
    modules_dir,
    additional_instructions: str = "",
) -> dict:
    """
    Smart code generation that chooses between old and agentic coder.

    Agentic coder (tool-calling) is now the default. Set USE_AGENTIC_CODER=0 to use old prompt-based.
    """
    use_agentic = _use_agentic_coder()
    logger.info(f"[smart_generate_code] Using {'AGENTIC (tool-calling)' if use_agentic else 'PROMPT-BASED'} coder")

    if use_agentic:
        return await generate_code_agentic(
            project_id=project_id,
            project_name=project_name,
            template_id=template_id,
            spec_yaml=spec_yaml,
            user_id=user_id,
            templates_dir=templates_dir,
            run_compile=True,
        )
    else:
        return await generate_code_with_agents(
            project_id=project_id,
            project_name=project_name,
            template_id=template_id,
            spec_yaml=spec_yaml,
            user_id=user_id,
            skeleton_manifest=skeleton_manifest,
            templates_dir=templates_dir,
            modules_dir=modules_dir,
            additional_instructions=additional_instructions,
        )
