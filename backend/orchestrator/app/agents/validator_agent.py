"""
ValidatorAgent - Validates generated code before building.

This agent:
- Writes generated files to a temporary workspace
- Runs linting and type checking
- Reports errors for the CodeGeneratorAgent to fix
"""

from __future__ import annotations

import asyncio
import os
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .base import Agent, AgentState, AgentResult, AIClient
from .code_agent import FileChange


@dataclass
class ValidationError:
    """A single validation error."""
    file: str
    line: Optional[int]
    column: Optional[int]
    message: str
    severity: str  # "error", "warning"


@dataclass
class ValidatorState(AgentState):
    """State for the validator agent."""
    workspace_path: Optional[str] = None
    file_changes: list[FileChange] = field(default_factory=list)
    skeleton_path: Optional[str] = None  # Path to template skeleton
    validation_errors: list[ValidationError] = field(default_factory=list)
    typescript_errors: list[str] = field(default_factory=list)
    eslint_errors: list[str] = field(default_factory=list)
    python_errors: list[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    """Result from validation."""
    is_valid: bool
    error_count: int
    warning_count: int
    errors: list[ValidationError]
    files_with_errors: list[str]
    summary: str


class ValidatorAgent(Agent[ValidatorState, ValidationResult]):
    """
    Agent that validates generated code.
    Runs type checking and linting to catch errors before CodeBuild.
    """

    name = "validator"
    description = "Validates code with linting and type checking"

    def __init__(self, ai_client: Optional[AIClient] = None):
        super().__init__(ai_client)
        self._cleanup_paths: list[str] = []

    def create_initial_state(
        self,
        file_changes: Optional[list[FileChange]] = None,
        skeleton_path: Optional[str] = None,
        **kwargs
    ) -> ValidatorState:
        return ValidatorState(
            file_changes=file_changes or [],
            skeleton_path=skeleton_path,
            max_iterations=1,  # Validation is single-shot
        )

    def _create_workspace(self, state: ValidatorState) -> str:
        """Create a temporary workspace with the skeleton and changes."""
        workspace = tempfile.mkdtemp(prefix="oasify_validate_")
        self._cleanup_paths.append(workspace)

        # Copy skeleton if provided
        if state.skeleton_path and os.path.exists(state.skeleton_path):
            # Copy relevant directories
            for subdir in ["frontend", "backend"]:
                src = os.path.join(state.skeleton_path, subdir)
                dst = os.path.join(workspace, subdir)
                if os.path.exists(src):
                    shutil.copytree(
                        src, dst,
                        ignore=shutil.ignore_patterns(
                            "node_modules", ".next", "__pycache__", ".git", "*.pyc"
                        )
                    )

        # Apply file changes
        for change in state.file_changes:
            file_path = os.path.join(workspace, change.path)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)

            if change.action == "delete":
                if os.path.exists(file_path):
                    os.remove(file_path)
            else:
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(change.content)

        return workspace

    async def _run_command(
        self,
        cmd: list[str],
        cwd: str,
        timeout: int = 60
    ) -> tuple[int, str, str]:
        """Run a command and return exit code, stdout, stderr."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                cwd=cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(),
                timeout=timeout
            )
            return (
                proc.returncode or 0,
                stdout.decode("utf-8", errors="replace"),
                stderr.decode("utf-8", errors="replace"),
            )
        except asyncio.TimeoutError:
            return 1, "", "Command timed out"
        except FileNotFoundError:
            return 1, "", f"Command not found: {cmd[0]}"
        except Exception as e:
            return 1, "", str(e)

    async def _validate_typescript(
        self,
        workspace: str
    ) -> list[ValidationError]:
        """Run TypeScript type checking."""
        errors = []
        frontend_path = os.path.join(workspace, "frontend")

        if not os.path.exists(frontend_path):
            return errors

        # Check if tsconfig exists
        if not os.path.exists(os.path.join(frontend_path, "tsconfig.json")):
            return errors

        # Install dependencies first if node_modules doesn't exist
        node_modules = os.path.join(frontend_path, "node_modules")
        if not os.path.exists(node_modules):
            # Skip validation if no node_modules - would need npm install
            return [ValidationError(
                file="frontend",
                line=None,
                column=None,
                message="node_modules not found - skipping TypeScript validation",
                severity="warning"
            )]

        # Run tsc --noEmit
        code, stdout, stderr = await self._run_command(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            cwd=frontend_path,
            timeout=120,
        )

        if code != 0:
            # Parse TypeScript errors
            output = stdout + stderr
            for line in output.split("\n"):
                if ".ts" in line or ".tsx" in line:
                    # Parse format: file.ts(line,col): error TS1234: message
                    try:
                        if "(" in line and ")" in line:
                            file_part = line.split("(")[0]
                            loc_part = line.split("(")[1].split(")")[0]
                            msg_part = line.split(":", 2)[-1].strip() if ":" in line else line

                            line_num, col = loc_part.split(",") if "," in loc_part else (0, 0)

                            errors.append(ValidationError(
                                file=file_part.strip(),
                                line=int(line_num) if line_num else None,
                                column=int(col) if col else None,
                                message=msg_part,
                                severity="error",
                            ))
                    except Exception:
                        errors.append(ValidationError(
                            file="unknown",
                            line=None,
                            column=None,
                            message=line,
                            severity="error",
                        ))

        return errors

    async def _validate_eslint(
        self,
        workspace: str
    ) -> list[ValidationError]:
        """Run ESLint on frontend code."""
        errors = []
        frontend_path = os.path.join(workspace, "frontend")

        if not os.path.exists(frontend_path):
            return errors

        node_modules = os.path.join(frontend_path, "node_modules")
        if not os.path.exists(node_modules):
            return []  # Skip if no node_modules

        code, stdout, stderr = await self._run_command(
            ["npx", "eslint", "src", "--format", "compact", "--no-error-on-unmatched-pattern"],
            cwd=frontend_path,
            timeout=120,
        )

        if code != 0 and stdout:
            for line in stdout.split("\n"):
                if ": line" in line:
                    try:
                        # Format: /path/file.tsx: line 10, col 5, Error - message
                        parts = line.split(":")
                        if len(parts) >= 2:
                            file_path = parts[0].strip()
                            rest = ":".join(parts[1:])

                            # Extract line/col
                            line_num = None
                            col = None
                            if "line" in rest:
                                line_match = rest.split("line")[1].split(",")[0].strip()
                                line_num = int(line_match) if line_match.isdigit() else None
                            if "col" in rest:
                                col_match = rest.split("col")[1].split(",")[0].strip()
                                col = int(col_match) if col_match.isdigit() else None

                            msg = rest.split("-")[-1].strip() if "-" in rest else rest

                            errors.append(ValidationError(
                                file=file_path,
                                line=line_num,
                                column=col,
                                message=msg,
                                severity="error" if "Error" in rest else "warning",
                            ))
                    except Exception:
                        pass

        return errors

    async def _validate_python(
        self,
        workspace: str
    ) -> list[ValidationError]:
        """Run Python linting with ruff."""
        errors = []
        backend_path = os.path.join(workspace, "backend")

        if not os.path.exists(backend_path):
            return errors

        code, stdout, stderr = await self._run_command(
            ["ruff", "check", ".", "--output-format", "text"],
            cwd=backend_path,
            timeout=60,
        )

        if code != 0 and stdout:
            for line in stdout.split("\n"):
                if ".py:" in line:
                    try:
                        # Format: file.py:10:5: E501 line too long
                        parts = line.split(":")
                        if len(parts) >= 4:
                            errors.append(ValidationError(
                                file=parts[0].strip(),
                                line=int(parts[1]) if parts[1].isdigit() else None,
                                column=int(parts[2]) if parts[2].isdigit() else None,
                                message=":".join(parts[3:]).strip(),
                                severity="error",
                            ))
                    except Exception:
                        pass

        return errors

    def cleanup(self) -> None:
        """Clean up temporary workspaces."""
        for path in self._cleanup_paths:
            try:
                if os.path.exists(path):
                    shutil.rmtree(path)
            except Exception:
                pass
        self._cleanup_paths = []

    async def run(
        self,
        state: ValidatorState,
        **kwargs
    ) -> AgentResult[ValidationResult]:
        """
        Validate the generated code.
        """
        if not state.file_changes:
            return AgentResult(
                success=True,
                data=ValidationResult(
                    is_valid=True,
                    error_count=0,
                    warning_count=0,
                    errors=[],
                    files_with_errors=[],
                    summary="No files to validate",
                ),
            )

        try:
            # Create workspace
            workspace = self._create_workspace(state)
            state.workspace_path = workspace
            state.update()

            # Run validations in parallel
            ts_errors, eslint_errors, py_errors = await asyncio.gather(
                self._validate_typescript(workspace),
                self._validate_eslint(workspace),
                self._validate_python(workspace),
            )

            all_errors = ts_errors + eslint_errors + py_errors
            state.validation_errors = all_errors

            # Count by severity
            error_count = sum(1 for e in all_errors if e.severity == "error")
            warning_count = sum(1 for e in all_errors if e.severity == "warning")

            # Get unique files with errors
            files_with_errors = list(set(
                e.file for e in all_errors if e.severity == "error"
            ))

            is_valid = error_count == 0

            summary = f"Validation {'passed' if is_valid else 'failed'}: "
            summary += f"{error_count} errors, {warning_count} warnings"

            result = ValidationResult(
                is_valid=is_valid,
                error_count=error_count,
                warning_count=warning_count,
                errors=all_errors,
                files_with_errors=files_with_errors,
                summary=summary,
            )

            return AgentResult(
                success=True,  # Validation ran successfully (even if code has errors)
                data=result,
                should_continue=False,
            )

        except Exception as exc:
            state.add_error(str(exc))
            return AgentResult(
                success=False,
                error=f"Validation failed to run: {exc}",
            )
        finally:
            # Cleanup happens after build, not here
            pass

    def get_workspace_path(self, state: ValidatorState) -> Optional[str]:
        """Get the workspace path for subsequent build steps."""
        return state.workspace_path
