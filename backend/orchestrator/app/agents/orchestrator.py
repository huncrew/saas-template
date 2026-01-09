"""
AgentOrchestrator - Coordinates multiple agents for the full build pipeline.

This orchestrator:
- Manages conversation state across chat turns
- Coordinates spec generation when ready
- Runs code generation with validation retry loops
- Prepares artifacts for CodeBuild
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

import yaml

from .base import AIClient, AgentStatus
from .chat_agent import ChatAgent, ChatState, ChatMessage
from .spec_agent import SpecGeneratorAgent, SpecState
from .code_agent import CodeGeneratorAgent, CodeGenState, FileChange
from .validator_agent import ValidatorAgent, ValidatorState
from .security_agent import SecurityAgent, run_security_scan, SecurityFinding


class ProjectPhase(Enum):
    """Phases of the project lifecycle."""
    CHATTING = "chatting"  # Gathering requirements
    SPEC_READY = "spec_ready"  # Spec generated, awaiting approval
    GENERATING = "generating"  # Code generation in progress
    VALIDATING = "validating"  # Validation in progress
    SECURITY_SCANNING = "security_scanning"  # Security scan in progress
    VALIDATED = "validated"  # Ready for CodeBuild
    BUILDING = "building"  # CodeBuild running
    COMPLETED = "completed"  # Build finished
    FAILED = "failed"


@dataclass
class OrchestratorState:
    """
    Full state of the orchestration.
    Persisted to allow resumption across requests.
    """
    project_id: str
    phase: ProjectPhase = ProjectPhase.CHATTING

    # Chat state
    chat_history: list[dict] = field(default_factory=list)
    readiness_score: int = 0
    extracted_requirements: dict = field(default_factory=dict)

    # Spec state
    spec_yaml: Optional[str] = None
    spec_summary: Optional[str] = None
    modules_selected: list[str] = field(default_factory=list)

    # Code gen state
    file_changes: list[dict] = field(default_factory=list)  # Serialized FileChange
    generation_attempts: int = 0

    # Validation state
    validation_errors: list[dict] = field(default_factory=list)
    is_validated: bool = False

    # Security state
    security_findings: list[dict] = field(default_factory=list)
    security_passed: bool = False

    # Build state
    build_id: Optional[str] = None

    # Meta
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "phase": self.phase.value,
            "chat_history": self.chat_history,
            "readiness_score": self.readiness_score,
            "extracted_requirements": self.extracted_requirements,
            "spec_yaml": self.spec_yaml,
            "spec_summary": self.spec_summary,
            "modules_selected": self.modules_selected,
            "file_changes": self.file_changes,
            "generation_attempts": self.generation_attempts,
            "validation_errors": self.validation_errors,
            "is_validated": self.is_validated,
            "security_findings": self.security_findings,
            "security_passed": self.security_passed,
            "build_id": self.build_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "errors": self.errors,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "OrchestratorState":
        state = cls(project_id=data["project_id"])
        state.phase = ProjectPhase(data.get("phase", "chatting"))
        state.chat_history = data.get("chat_history", [])
        state.readiness_score = data.get("readiness_score", 0)
        state.extracted_requirements = data.get("extracted_requirements", {})
        state.spec_yaml = data.get("spec_yaml")
        state.spec_summary = data.get("spec_summary")
        state.modules_selected = data.get("modules_selected", [])
        state.file_changes = data.get("file_changes", [])
        state.generation_attempts = data.get("generation_attempts", 0)
        state.validation_errors = data.get("validation_errors", [])
        state.is_validated = data.get("is_validated", False)
        state.security_findings = data.get("security_findings", [])
        state.security_passed = data.get("security_passed", False)
        state.build_id = data.get("build_id")
        state.created_at = data.get("created_at", state.created_at)
        state.updated_at = data.get("updated_at", state.updated_at)
        state.errors = data.get("errors", [])
        return state

    def update(self) -> None:
        self.updated_at = datetime.now(timezone.utc).isoformat()


@dataclass
class ChatResponse:
    """Response from a chat turn."""
    message: str
    followups: list[str]
    phase: ProjectPhase
    readiness_score: int
    suggested_action: str
    spec_preview: Optional[str] = None


@dataclass
class GenerationResponse:
    """Response from code generation."""
    success: bool
    phase: ProjectPhase
    files_generated: int
    validation_passed: bool
    security_passed: bool
    security_findings: list[dict]
    errors: list[str]
    ready_for_build: bool


class AgentOrchestrator:
    """
    Main orchestrator that coordinates all agents.
    """

    def __init__(
        self,
        ai_client: Optional[AIClient] = None,
        template_context: str = "",
        modules_context: str = "",
        skeleton_manifest: Optional[list[str]] = None,
    ):
        self.ai = ai_client or AIClient()
        self.template_context = template_context
        self.modules_context = modules_context
        self.skeleton_manifest = skeleton_manifest or []

        # Initialize agents
        self.chat_agent = ChatAgent(self.ai)
        self.spec_agent = SpecGeneratorAgent(self.ai)
        self.code_agent = CodeGeneratorAgent(self.ai)
        self.validator_agent = ValidatorAgent(self.ai)
        self.security_agent = SecurityAgent()

    async def process_chat(
        self,
        state: OrchestratorState,
        message: str,
        user_id: str,
        project_name: str = "",
        template_id: str = "",
        auto_generate_spec: bool = True,
    ) -> tuple[ChatResponse, OrchestratorState]:
        """
        Process a chat message and update state.
        May trigger spec generation if readiness is high.
        """
        # Build chat state from orchestrator state
        chat_state = self.chat_agent.create_initial_state(
            project_name=project_name,
            template_id=template_id,
            template_context=self.template_context,
            modules_context=self.modules_context,
        )
        chat_state.history = [
            ChatMessage(role=h["role"], content=h["content"])
            for h in state.chat_history
        ]
        chat_state.readiness_score = state.readiness_score
        chat_state.extracted_requirements = state.extracted_requirements

        # Run chat agent
        result = await self.chat_agent.run(
            chat_state,
            user_message=message,
            user_id=user_id,
        )

        # Update orchestrator state
        state.chat_history = [
            {"role": m.role, "content": m.content}
            for m in chat_state.history
        ]
        state.readiness_score = chat_state.readiness_score
        state.extracted_requirements = chat_state.extracted_requirements
        state.update()

        if not result.success or not result.data:
            return ChatResponse(
                message="I had trouble processing that. Could you rephrase?",
                followups=["What would you like to build?"],
                phase=state.phase,
                readiness_score=state.readiness_score,
                suggested_action="continue_chat",
            ), state

        chat_result = result.data

        # Check if we should auto-generate spec
        # Be aggressive: at 70%+ readiness, always generate spec
        # At 60-69%, generate if agent suggests it
        spec_preview = None
        should_generate_spec = (
            auto_generate_spec
            and (
                chat_result.readiness_score >= 70  # High readiness = auto generate
                or (chat_result.readiness_score >= 60 and chat_result.suggested_action in ("generate_spec", "build_preview"))
            )
        )
        if should_generate_spec:
            try:
                spec_result = await self._generate_spec(state, user_id, project_name, template_id)
                if spec_result:
                    spec_preview = state.spec_summary
                    state.phase = ProjectPhase.SPEC_READY
            except Exception as e:
                state.errors.append(f"Spec generation failed: {e}")

        return ChatResponse(
            message=chat_result.assistant_message,
            followups=chat_result.followup_questions,
            phase=state.phase,
            readiness_score=chat_result.readiness_score,
            suggested_action=chat_result.suggested_action,
            spec_preview=spec_preview,
        ), state

    async def _generate_spec(
        self,
        state: OrchestratorState,
        user_id: str,
        project_name: str,
        template_id: str,
    ) -> bool:
        """Generate spec from conversation."""
        conversation_summary = "\n".join([
            f"{'User' if h['role'] == 'user' else 'Assistant'}: {h['content']}"
            for h in state.chat_history
        ])

        spec_state = self.spec_agent.create_initial_state(
            conversation_summary=conversation_summary,
            extracted_requirements=state.extracted_requirements,
            project_name=project_name,
            template_id=template_id,
            template_context=self.template_context,
            modules_context=self.modules_context,
        )

        result, spec_state = await self.spec_agent.run_until_complete(
            spec_state,
            user_id=user_id,
        )

        if result.success and result.data:
            state.spec_yaml = result.data.spec_yaml
            state.spec_summary = result.data.spec_summary
            state.modules_selected = result.data.modules_selected
            state.update()
            return True

        return False

    async def generate_code(
        self,
        state: OrchestratorState,
        user_id: str,
        project_name: str = "",
        template_id: str = "",
        max_validation_attempts: int = 3,
        additional_instructions: str = "",
    ) -> tuple[GenerationResponse, OrchestratorState]:
        """
        Generate code from the spec with validation retry loop.
        """
        if not state.spec_yaml:
            return GenerationResponse(
                success=False,
                phase=state.phase,
                files_generated=0,
                validation_passed=False,
                security_passed=False,
                security_findings=[],
                errors=["No spec available. Complete chat first."],
                ready_for_build=False,
            ), state

        state.phase = ProjectPhase.GENERATING
        state.update()

        # Initialize code gen state with any additional instructions (e.g., from previous failures)
        code_state = self.code_agent.create_initial_state(
            spec_yaml=state.spec_yaml,
            project_name=project_name,
            template_id=template_id,
            skeleton_manifest=self.skeleton_manifest,
            template_context=self.template_context,
            additional_instructions=additional_instructions,
        )

        for attempt in range(max_validation_attempts):
            state.generation_attempts = attempt + 1

            # Generate code
            gen_result = await self.code_agent.run(
                code_state,
                user_id=user_id,
            )

            if not gen_result.success or not gen_result.data:
                state.errors.append(gen_result.error or "Code generation failed")
                continue

            # Validate
            state.phase = ProjectPhase.VALIDATING
            state.update()

            validator_state = self.validator_agent.create_initial_state(
                file_changes=gen_result.data.file_changes,
            )

            val_result = await self.validator_agent.run(validator_state)

            if val_result.success and val_result.data:
                if val_result.data.is_valid:
                    # Validation passed - now run security scan
                    state.file_changes = [
                        {"path": fc.path, "action": fc.action, "content": fc.content}
                        for fc in gen_result.data.file_changes
                    ]
                    state.is_validated = True

                    # Run security scan
                    state.phase = ProjectPhase.SECURITY_SCANNING
                    state.update()

                    security_files = [
                        {"path": fc.path, "content": fc.content}
                        for fc in gen_result.data.file_changes
                    ]
                    security_result = run_security_scan(security_files)

                    # Store security findings
                    state.security_findings = security_result.get("findings", [])
                    state.security_passed = security_result.get("passed", False)

                    # Mark as validated (security is informational, doesn't block)
                    state.phase = ProjectPhase.VALIDATED
                    state.update()

                    return GenerationResponse(
                        success=True,
                        phase=state.phase,
                        files_generated=len(gen_result.data.file_changes),
                        validation_passed=True,
                        security_passed=state.security_passed,
                        security_findings=state.security_findings,
                        errors=[],
                        ready_for_build=True,
                    ), state

                # Validation failed - prepare for retry
                state.validation_errors = [
                    {"file": e.file, "line": e.line, "message": e.message}
                    for e in val_result.data.errors
                ]

                # Feed errors back to code agent
                self.code_agent.apply_validation_feedback(
                    code_state,
                    errors=[e.message for e in val_result.data.errors],
                    files_with_errors=val_result.data.files_with_errors,
                )

        # Exhausted attempts
        state.phase = ProjectPhase.FAILED
        state.update()

        return GenerationResponse(
            success=False,
            phase=state.phase,
            files_generated=len(code_state.file_changes),
            validation_passed=False,
            security_passed=False,
            security_findings=[],
            errors=[f"Failed after {max_validation_attempts} attempts"] + state.errors[-3:],
            ready_for_build=False,
        ), state

    def get_file_changes(self, state: OrchestratorState) -> list[FileChange]:
        """Get file changes as FileChange objects."""
        return [
            FileChange(
                path=fc["path"],
                action=fc["action"],
                content=fc["content"],
            )
            for fc in state.file_changes
        ]

    def get_patch_diff(self, state: OrchestratorState) -> str:
        """
        Generate a unified diff from file changes.
        For backwards compatibility with existing CodeBuild.
        """
        diff_parts = []

        for fc in state.file_changes:
            path = fc["path"]
            content = fc["content"]
            action = fc["action"]

            # Normalize content - remove trailing whitespace and ensure single trailing newline
            content = content.rstrip() + "\n"
            lines = content.split("\n")
            # Remove empty last element from split (since we added \n)
            if lines and lines[-1] == "":
                lines = lines[:-1]

            line_count = len(lines)

            if action == "create":
                diff_parts.append(f"diff --git a/{path} b/{path}")
                diff_parts.append("new file mode 100644")
                diff_parts.append("--- /dev/null")
                diff_parts.append(f"+++ b/{path}")
                diff_parts.append(f"@@ -0,0 +1,{line_count} @@")
                for line in lines:
                    diff_parts.append(f"+{line}")
            elif action == "modify":
                # For modify without original content, we create the file fresh
                # This works because git apply with --allow-empty handles it
                diff_parts.append(f"diff --git a/{path} b/{path}")
                diff_parts.append("new file mode 100644")
                diff_parts.append("--- /dev/null")
                diff_parts.append(f"+++ b/{path}")
                diff_parts.append(f"@@ -0,0 +1,{line_count} @@")
                for line in lines:
                    diff_parts.append(f"+{line}")

        # Ensure patch ends with newline
        return "\n".join(diff_parts) + "\n"
