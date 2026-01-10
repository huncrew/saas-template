"""
AutonomousBuildController - Self-healing build loop with real-time progress.

This controller:
- Manages the build → validate → fix → retry loop
- Streams progress updates via SSE
- Integrates with AutonomousAgent for learning and improvements
- Caps retries and reports final status
"""

from __future__ import annotations

import asyncio
import json
import os
import traceback
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, AsyncGenerator, Callable, Optional

from .autonomous_agent import AutonomousAgent, analyze_and_improve, get_improved_prompt
from .security_agent import run_security_scan
# NOTE: run_compile_validation removed - ECS container doesn't have npm


class BuildPhase(Enum):
    """Phases of the autonomous build process."""
    INITIALIZING = "initializing"
    GENERATING = "generating"
    VALIDATING = "validating"
    PREBUILD_VALIDATING = "prebuild_validating"
    COMPILE_VALIDATING = "compile_validating"  # Real npm ci && npm run build
    SECURITY_SCANNING = "security_scanning"
    ANALYZING_ERRORS = "analyzing_errors"
    IMPROVING = "improving"
    RETRYING = "retrying"
    BUILDING = "building"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


@dataclass
class BuildProgress:
    """Progress update from the build controller."""
    phase: BuildPhase
    message: str
    attempt: int
    max_attempts: int
    errors: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    security_findings: list[dict] = field(default_factory=list)
    files_generated: int = 0
    build_id: str = ""  # Include build_id for frontend to fetch details
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_sse(self) -> str:
        """Convert to SSE format."""
        data = {
            "phase": self.phase.value,
            "message": self.message,
            "attempt": self.attempt,
            "max_attempts": self.max_attempts,
            "errors": self.errors,
            "improvements": self.improvements,
            "security_findings": self.security_findings,
            "files_generated": self.files_generated,
            "build_id": self.build_id,
            "timestamp": self.timestamp,
        }
        return f"data: {json.dumps(data)}\n\n"


@dataclass
class AutonomousBuildResult:
    """Final result from autonomous build."""
    success: bool
    build_id: Optional[str]
    attempts: int
    phase: BuildPhase
    files_generated: int
    validation_passed: bool
    security_passed: bool
    security_findings: list[dict]
    errors: list[str]
    improvements_applied: list[str]
    final_message: str


class AutonomousBuildController:
    """
    Controller for autonomous build loop with self-healing capabilities.
    """

    def __init__(
        self,
        max_attempts: int = 3,
        learning_state: Optional[dict] = None,
    ):
        self.max_attempts = max_attempts
        self.learning_state = learning_state or {}
        self.autonomous_agent = AutonomousAgent()
        self._progress_callbacks: list[Callable[[BuildProgress], None]] = []

    def add_progress_callback(self, callback: Callable[[BuildProgress], None]) -> None:
        """Add a callback to receive progress updates."""
        self._progress_callbacks.append(callback)

    def _emit_progress(self, progress: BuildProgress) -> None:
        """Emit progress to all callbacks."""
        for callback in self._progress_callbacks:
            try:
                callback(progress)
            except Exception:
                pass  # Don't let callback errors break the build

    async def run_autonomous_build(
        self,
        project_id: str,
        spec_yaml: str,
        generate_code_fn: Callable[..., Any],
        trigger_codebuild_fn: Callable[..., Any],
        user_id: str = "",
        **kwargs
    ) -> AsyncGenerator[BuildProgress, None]:
        """
        Run the autonomous build loop with progress streaming.

        Args:
            project_id: Project ID
            spec_yaml: The spec YAML to build from
            generate_code_fn: Function to call for code generation
            trigger_codebuild_fn: Function to trigger CodeBuild
            user_id: User ID for tracking
            **kwargs: Additional args for code generation

        Yields:
            BuildProgress updates as the build progresses
        """
        attempt = 0
        all_errors: list[str] = []
        all_improvements: list[str] = []
        last_gen_result: Optional[dict] = None
        final_security_findings: list[dict] = []

        # Initial progress
        yield BuildProgress(
            phase=BuildPhase.INITIALIZING,
            message="Starting autonomous build...",
            attempt=0,
            max_attempts=self.max_attempts,
        )

        while attempt < self.max_attempts:
            attempt += 1

            # Phase: Generating
            yield BuildProgress(
                phase=BuildPhase.GENERATING,
                message=f"Generating code (attempt {attempt}/{self.max_attempts})...",
                attempt=attempt,
                max_attempts=self.max_attempts,
                improvements=all_improvements,
            )

            try:
                # Get improved prompt if we have learning data AND actual errors
                improved_kwargs = dict(kwargs)
                if attempt > 1:
                    # Pass ACTUAL errors to the code generator, not just patterns
                    error_context = self._build_error_context(all_errors)
                    if error_context:
                        improved_kwargs["additional_instructions"] = error_context
                    elif self.learning_state:
                        improved_kwargs["additional_instructions"] = self._get_improvement_instructions()

                # Generate code
                #
                # IMPORTANT: Keep SSE alive while generation runs.
                # Long model calls (especially Opus) can take 30-120s, which can exceed
                # ALB/proxy idle timeouts if we don't emit progress.
                heartbeat_s = float(os.getenv("SSE_HEARTBEAT_SECONDS", "10"))
                gen_task = asyncio.create_task(asyncio.to_thread(
                    generate_code_fn,
                    project_id=project_id,
                    spec_yaml=spec_yaml,
                    user_id=user_id,
                    **improved_kwargs
                ))
                while not gen_task.done():
                    try:
                        await asyncio.wait_for(asyncio.shield(gen_task), timeout=heartbeat_s)
                    except asyncio.TimeoutError:
                        yield BuildProgress(
                            phase=BuildPhase.GENERATING,
                            message=f"Generating code (attempt {attempt}/{self.max_attempts})... still working",
                            attempt=attempt,
                            max_attempts=self.max_attempts,
                            improvements=all_improvements,
                        )
                        continue
                gen_result = await gen_task
                last_gen_result = gen_result

                if not gen_result.get("success"):
                    error_msg = gen_result.get("error", "Code generation failed")
                    all_errors.append(f"Attempt {attempt}: {error_msg}")

                    # If agentic generation ran a real compile and captured output,
                    # surface the *actual* TypeScript/webpack errors to the UI.
                    compile_output = gen_result.get("compile_output") or ""
                    if compile_output:
                        try:
                            extracted = self._extract_build_errors(compile_output)
                            if extracted:
                                all_errors.extend([f"Compile: {e}" for e in extracted[:5]])
                            else:
                                # Fallback: include a truncated snippet so we have *something* actionable.
                                snippet = compile_output.strip()
                                if len(snippet) > 800:
                                    snippet = snippet[:800] + "..."
                                if snippet:
                                    all_errors.append(f"Compile output: {snippet}")
                        except Exception:
                            pass

                    # Phase: Analyzing errors
                    yield BuildProgress(
                        phase=BuildPhase.ANALYZING_ERRORS,
                        message=f"Analyzing generation failure: {error_msg[:100]}...",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        errors=all_errors,
                    )

                    # Analyze with autonomous agent
                    analysis = analyze_and_improve(
                        build_result={
                            "build_id": f"gen_{attempt}",
                            "project_id": project_id,
                            "success": False,
                            "validation_passed": False,
                            "security_passed": True,
                            "validation_errors": gen_result.get("validation_errors", []),
                            "attempt_count": attempt,
                        },
                        learning_state=self.learning_state,
                    )

                    if analysis.get("success"):
                        self.learning_state = analysis.get("learning_state", {})
                        new_improvements = [
                            imp.get("suggestion", str(imp))
                            for imp in analysis.get("improvements", [])
                        ]
                        all_improvements.extend(new_improvements[:2])  # Limit to avoid bloat

                        if analysis.get("should_retry"):
                            # Phase: Improving
                            yield BuildProgress(
                                phase=BuildPhase.IMPROVING,
                                message=f"Applying improvements: {analysis.get('retry_strategy', 'Refining approach')}",
                                attempt=attempt,
                                max_attempts=self.max_attempts,
                                improvements=all_improvements,
                            )
                            continue

                    # Can't recover, fail this attempt
                    continue

                # Code generated successfully
                files_count = gen_result.get("files_count", 0)

                # Phase: Pre-build validation (fast Python checks)
                yield BuildProgress(
                    phase=BuildPhase.PREBUILD_VALIDATING,
                    message=f"Running pre-build validation on {files_count} files...",
                    attempt=attempt,
                    max_attempts=self.max_attempts,
                    files_generated=files_count,
                )

                # Check for pre-build validation failures (caught before CodeBuild)
                if gen_result.get("prebuild_failed"):
                    prebuild_errors = gen_result.get("validation_errors", [])
                    error_string = gen_result.get("prebuild_error_string", "")

                    # Add specific errors to our list
                    for err in prebuild_errors[:3]:
                        err_msg = f"[{err.get('type', 'ERROR')}] {err.get('file', '?')}:{err.get('line', '?')} - {err.get('message', 'Unknown error')}"
                        all_errors.append(err_msg)

                    yield BuildProgress(
                        phase=BuildPhase.ANALYZING_ERRORS,
                        message=f"Pre-build validation found {len(prebuild_errors)} issues (fast fix, no CodeBuild needed)",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        errors=all_errors,
                    )

                    # Build specific fix instructions from prebuild errors
                    fix_instructions = "PRE-BUILD VALIDATION FAILED. Fix these issues:\n\n" + error_string
                    for err in prebuild_errors[:3]:
                        if err.get("suggestion"):
                            fix_instructions += f"\nFix: {err.get('suggestion')}"

                    all_improvements.append("Fix pre-build validation errors")

                    yield BuildProgress(
                        phase=BuildPhase.RETRYING,
                        message="Retrying with pre-build fixes (instant feedback loop)...",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        errors=all_errors,
                        improvements=all_improvements,
                    )

                    # Update kwargs with specific fix instructions for next iteration
                    if "additional_instructions" not in kwargs:
                        kwargs["additional_instructions"] = ""
                    kwargs["additional_instructions"] = fix_instructions
                    continue

                # Phase: Validating (schema/structure validation)
                yield BuildProgress(
                    phase=BuildPhase.VALIDATING,
                    message=f"Validating {files_count} generated files...",
                    attempt=attempt,
                    max_attempts=self.max_attempts,
                    files_generated=files_count,
                )

                if not gen_result.get("validated", False):
                    validation_errors = gen_result.get("validation_errors", [])
                    error_msgs = [e.get("message", str(e)) for e in validation_errors[:3]]
                    all_errors.extend([f"Validation: {e}" for e in error_msgs])

                    # Phase: Analyzing errors
                    yield BuildProgress(
                        phase=BuildPhase.ANALYZING_ERRORS,
                        message=f"Found {len(validation_errors)} validation errors, analyzing...",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        errors=all_errors,
                    )

                    # Analyze for retry
                    analysis = analyze_and_improve(
                        build_result={
                            "build_id": f"val_{attempt}",
                            "project_id": project_id,
                            "success": False,
                            "validation_passed": False,
                            "security_passed": True,
                            "validation_errors": validation_errors,
                            "attempt_count": attempt,
                        },
                        learning_state=self.learning_state,
                    )

                    if analysis.get("success"):
                        self.learning_state = analysis.get("learning_state", {})

                        if analysis.get("should_retry"):
                            strategy = analysis.get("retry_strategy", "Fixing issues")
                            all_improvements.append(strategy)

                            # Phase: Retrying
                            yield BuildProgress(
                                phase=BuildPhase.RETRYING,
                                message=f"Retrying with fix: {strategy}",
                                attempt=attempt,
                                max_attempts=self.max_attempts,
                                errors=all_errors,
                                improvements=all_improvements,
                            )
                            continue

                    continue

                # NOTE: Compile validation (npm ci && npm run build) is SKIPPED here because
                # the ECS container doesn't have Node.js installed. CodeBuild will do the
                # real npm build after this step. The prebuild validator catches most issues.

                # Validation passed - check security
                yield BuildProgress(
                    phase=BuildPhase.SECURITY_SCANNING,
                    message="Running security scan...",
                    attempt=attempt,
                    max_attempts=self.max_attempts,
                    files_generated=files_count,
                )

                security_findings = gen_result.get("security_findings", [])
                security_passed = gen_result.get("security_passed", True)
                final_security_findings = security_findings

                # Security is informational, doesn't block the build
                security_msg = "Security scan passed" if security_passed else f"Found {len(security_findings)} security findings"

                # Phase: Building
                yield BuildProgress(
                    phase=BuildPhase.BUILDING,
                    message=f"{security_msg}. Triggering CodeBuild...",
                    attempt=attempt,
                    max_attempts=self.max_attempts,
                    files_generated=files_count,
                    security_findings=security_findings,
                )

                # Trigger the actual build
                build_result = await asyncio.to_thread(
                    trigger_codebuild_fn,
                    project_id=project_id,
                    gen_result=gen_result,
                    user_id=user_id,
                )

                if not build_result.get("success"):
                    # Build trigger failed
                    all_errors.append(f"CodeBuild trigger failed: {build_result.get('error', 'Unknown')}")
                    continue

                # Build triggered - now poll for completion
                codebuild_id = build_result.get("codebuild_id")
                if codebuild_id:
                    yield BuildProgress(
                        phase=BuildPhase.BUILDING,
                        message=f"CodeBuild started ({codebuild_id[:20]}...), waiting for completion...",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        files_generated=files_count,
                        security_findings=security_findings,
                    )

                    # Poll CodeBuild status (max 5 minutes)
                    poll_fn = build_result.get("poll_fn")
                    if poll_fn:
                        max_polls = 60  # 5 minutes at 5 second intervals
                        for poll_count in range(max_polls):
                            await asyncio.sleep(5)

                            status = await asyncio.to_thread(poll_fn, codebuild_id)
                            cb_status = status.get("status", "UNKNOWN")

                            if cb_status == "SUCCEEDED":
                                yield BuildProgress(
                                    phase=BuildPhase.SUCCEEDED,
                                    message=f"Build succeeded after {attempt} attempt(s)!",
                                    attempt=attempt,
                                    max_attempts=self.max_attempts,
                                    files_generated=files_count,
                                    security_findings=security_findings,
                                    improvements=all_improvements,
                                    build_id=build_result.get("build_id", ""),
                                )
                                return

                            elif cb_status in ("FAILED", "FAULT", "STOPPED", "TIMED_OUT"):
                                # CodeBuild failed - extract ACTUAL errors from logs
                                build_logs = status.get("logs", "")

                                # Extract meaningful error messages from build logs
                                error_lines = self._extract_build_errors(build_logs)
                                if error_lines:
                                    all_errors.extend(error_lines[:5])  # Keep top 5 errors
                                else:
                                    all_errors.append(f"CodeBuild {cb_status} (no detailed logs available)")

                                yield BuildProgress(
                                    phase=BuildPhase.ANALYZING_ERRORS,
                                    message=f"CodeBuild failed with {len(error_lines)} errors, preparing retry...",
                                    attempt=attempt,
                                    max_attempts=self.max_attempts,
                                    errors=all_errors,
                                )

                                # Analyze CodeBuild failure for retry
                                analysis = analyze_and_improve(
                                    build_result={
                                        "build_id": codebuild_id,
                                        "project_id": project_id,
                                        "success": False,
                                        "validation_passed": False,
                                        "security_passed": True,
                                        "validation_errors": [{"message": e} for e in error_lines[:3]],
                                        "attempt_count": attempt,
                                    },
                                    learning_state=self.learning_state,
                                )

                                if analysis.get("success"):
                                    self.learning_state = analysis.get("learning_state", {})
                                    if analysis.get("should_retry") and attempt < self.max_attempts:
                                        strategy = analysis.get("retry_strategy", "Fixing build errors")
                                        all_improvements.append(strategy)

                                        # Emit RETRYING phase so UI shows we're trying again
                                        yield BuildProgress(
                                            phase=BuildPhase.RETRYING,
                                            message=f"Retrying with fix: {strategy}",
                                            attempt=attempt,
                                            max_attempts=self.max_attempts,
                                            errors=all_errors,
                                            improvements=all_improvements,
                                        )
                                break  # Break polling loop to retry code generation

                            elif cb_status == "IN_PROGRESS":
                                if poll_count % 6 == 0:  # Every 30 seconds
                                    yield BuildProgress(
                                        phase=BuildPhase.BUILDING,
                                        message=f"CodeBuild in progress... ({poll_count * 5}s)",
                                        attempt=attempt,
                                        max_attempts=self.max_attempts,
                                        files_generated=files_count,
                                    )
                        else:
                            # Timed out waiting
                            all_errors.append("CodeBuild timed out waiting for completion")
                    else:
                        # No poll function - assume success after trigger
                        yield BuildProgress(
                            phase=BuildPhase.SUCCEEDED,
                            message=f"Build triggered after {attempt} attempt(s)! (check CodeBuild for status)",
                            attempt=attempt,
                            max_attempts=self.max_attempts,
                            files_generated=files_count,
                            security_findings=security_findings,
                            improvements=all_improvements,
                            build_id=build_result.get("build_id", ""),
                        )
                        return
                else:
                    # No codebuild_id but success - just return
                    yield BuildProgress(
                        phase=BuildPhase.SUCCEEDED,
                        message=f"Build succeeded after {attempt} attempt(s)!",
                        attempt=attempt,
                        max_attempts=self.max_attempts,
                        files_generated=files_count,
                        security_findings=security_findings,
                        improvements=all_improvements,
                        build_id=build_result.get("build_id", ""),
                    )
                    return

            except Exception as e:
                traceback.print_exc()
                all_errors.append(f"Attempt {attempt} exception: {str(e)}")

                yield BuildProgress(
                    phase=BuildPhase.ANALYZING_ERRORS,
                    message=f"Error occurred: {str(e)[:100]}...",
                    attempt=attempt,
                    max_attempts=self.max_attempts,
                    errors=all_errors,
                )

        # Exhausted all attempts
        yield BuildProgress(
            phase=BuildPhase.FAILED,
            message=f"Build failed after {self.max_attempts} attempts",
            attempt=self.max_attempts,
            max_attempts=self.max_attempts,
            errors=all_errors,
            improvements=all_improvements,
            security_findings=final_security_findings,
            files_generated=last_gen_result.get("files_count", 0) if last_gen_result else 0,
        )

    def _extract_build_errors(self, build_logs: str) -> list[str]:
        """Extract meaningful error messages from CodeBuild logs.

        This parses the build output to find actual TypeScript/webpack errors
        that need to be fixed.
        """
        if not build_logs:
            return []

        errors = []
        lines = build_logs.split("\n")

        # Patterns that indicate actual errors
        error_indicators = [
            "Error:",
            "error TS",
            "TypeError:",
            "SyntaxError:",
            "Module not found",
            "Cannot find module",
            "is not exported",
            "has no exported member",
            "Unexpected eof",
            "Build failed",
            "Failed to compile",
            "Type error:",
        ]

        # Capture context around errors
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            if any(indicator in line for indicator in error_indicators):
                # Capture this line and some context
                error_context = []

                # Add 2 lines before for context
                for j in range(max(0, i - 2), i):
                    ctx = lines[j].strip()
                    if ctx and not ctx.startswith("at "):  # Skip stack traces
                        error_context.append(ctx)

                # Add the error line itself
                error_context.append(line_stripped)

                # Add 2 lines after for context
                for j in range(i + 1, min(len(lines), i + 3)):
                    ctx = lines[j].strip()
                    if ctx and not ctx.startswith("at "):
                        error_context.append(ctx)

                full_error = " | ".join(error_context)
                if len(full_error) > 300:
                    full_error = full_error[:300] + "..."

                if full_error and full_error not in errors:
                    errors.append(full_error)

        return errors[:10]  # Return at most 10 errors

    def _build_error_context(self, errors: list[str]) -> str:
        """Build specific error context from actual build errors.

        This passes the ACTUAL error messages to the AI so it can make
        targeted fixes, not just generic improvements.
        """
        if not errors:
            return ""

        # Extract the most relevant errors (last 3, most recent)
        recent_errors = errors[-3:]

        # Build a clear instruction with the actual errors
        error_text = "\n".join(f"  - {e[:500]}" for e in recent_errors)

        # Detect common error patterns and add specific guidance
        specific_guidance = []

        for error in recent_errors:
            error_lower = error.lower()

            if "cannot find module" in error_lower or "module not found" in error_lower:
                if "@/components/ui" in error:
                    specific_guidance.append(
                        "ERROR: Custom UI component doesn't exist. Use lucide-react icons or inline SVG for logos. "
                        "Only use shadcn components: button, card, table, tabs, dialog, select, checkbox, etc."
                    )
                elif "@/assets" in error:
                    specific_guidance.append(
                        "ERROR: Asset file doesn't exist. Remove the import. Use inline SVG or lucide-react icons instead."
                    )
                else:
                    specific_guidance.append(
                        "ERROR: Module doesn't exist. Either remove the import or generate the file with correct exports."
                    )

            if "not exported" in error_lower or "no exported member" in error_lower:
                specific_guidance.append(
                    "ERROR: Type/function declared but not exported. Add 'export' keyword: export type X = ... or export function X"
                )

            if "expected" in error_lower and (";" in error or "}" in error or "eof" in error_lower):
                specific_guidance.append(
                    "ERROR: Syntax error - invalid JavaScript/TypeScript. Check for unclosed braces, missing semicolons, or invalid syntax."
                )

        guidance_text = ""
        if specific_guidance:
            guidance_text = "\n\nSPECIFIC FIXES REQUIRED:\n" + "\n".join(f"  → {g}" for g in set(specific_guidance))

        return f"""
CRITICAL - Previous build failed with these EXACT errors. You MUST fix them:

{error_text}
{guidance_text}

RULES FOR FIXING:
1. NEVER import from @/components/ui/CustomName - only use standard shadcn components
2. NEVER import assets like @/assets/logo.png - use lucide-react icons or inline SVG
3. If you declare a type/interface, you MUST export it: export type X = ...
4. Every import must resolve to an existing file (in template or generated by you)
5. Generate valid TypeScript - check syntax carefully

Available shadcn components (ONLY these exist):
accordion, alert, avatar, badge, button, card, carousel, checkbox, dialog,
dropdown-menu, form, input, label, popover, progress, radio-group, scroll-area,
select, separator, sheet, skeleton, slider, sonner, switch, table, tabs, textarea, tooltip

Fix the errors above. Do not repeat the same mistakes.
"""

    def _get_improvement_instructions(self) -> str:
        """Generate improvement instructions from learning state."""
        instructions = []

        # Add instructions based on common errors
        error_patterns = self.learning_state.get("error_patterns_seen", {})
        if error_patterns:
            top_errors = sorted(error_patterns.items(), key=lambda x: x[1], reverse=True)[:3]
            for error_type, count in top_errors:
                if error_type == "type_error":
                    instructions.append("Ensure all TypeScript types are correct and complete")
                elif error_type == "missing_import":
                    instructions.append("Double-check all imports are present")
                elif error_type == "null_access":
                    instructions.append("Add null checks before property access")
                elif error_type == "type_mismatch":
                    instructions.append("Match function signatures exactly")

        # Add from recent improvements
        recent_improvements = self.learning_state.get("improvement_suggestions", [])[:2]
        for imp in recent_improvements:
            if isinstance(imp, dict) and imp.get("suggestion"):
                instructions.append(imp["suggestion"])

        if instructions:
            return "\n\nIMPORTANT - Avoid these issues:\n" + "\n".join(f"- {i}" for i in instructions)
        return ""


# Global learning state (in production, use Redis/DynamoDB)
_GLOBAL_LEARNING_STATE: dict = {}


def get_global_learning_state() -> dict:
    """Get the global learning state."""
    return _GLOBAL_LEARNING_STATE


def update_global_learning_state(state: dict) -> None:
    """Update the global learning state."""
    global _GLOBAL_LEARNING_STATE
    _GLOBAL_LEARNING_STATE = state


async def run_autonomous_build_with_sse(
    project_id: str,
    spec_yaml: str,
    generate_code_fn: Callable[..., Any],
    trigger_codebuild_fn: Callable[..., Any],
    user_id: str = "",
    max_attempts: int = 3,
    **kwargs
) -> AsyncGenerator[str, None]:
    """
    Run autonomous build and yield SSE-formatted progress updates.

    This is the main entry point for SSE streaming builds.
    """
    controller = AutonomousBuildController(
        max_attempts=max_attempts,
        learning_state=get_global_learning_state(),
    )

    async for progress in controller.run_autonomous_build(
        project_id=project_id,
        spec_yaml=spec_yaml,
        generate_code_fn=generate_code_fn,
        trigger_codebuild_fn=trigger_codebuild_fn,
        user_id=user_id,
        **kwargs
    ):
        # Update global learning state
        update_global_learning_state(controller.learning_state)

        # Yield SSE formatted progress
        yield progress.to_sse()

        # Small delay to prevent overwhelming clients
        await asyncio.sleep(0.1)
