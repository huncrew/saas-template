"""
CodeGeneratorAgent - Generates code from specifications.

This agent:
- Takes a structured spec and generates actual code
- Produces file-by-file changes (not monolithic diffs)
- Works with the ValidatorAgent in a retry loop
- Handles incremental fixes based on validation errors
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

from .base import Agent, AgentState, AgentResult, AIClient


@dataclass
class FileChange:
    """Represents a change to a single file."""
    path: str
    action: Literal["create", "modify", "delete"]
    content: str  # Full file content


@dataclass
class CodeGenState(AgentState):
    """State for the code generation agent."""
    spec_yaml: str = ""
    project_name: str = ""
    template_id: str = ""
    skeleton_manifest: list[str] = field(default_factory=list)  # Files in template
    template_context: str = ""

    # Generated output
    file_changes: list[FileChange] = field(default_factory=list)

    # Validation feedback for retry
    validation_errors: list[str] = field(default_factory=list)
    files_to_fix: list[str] = field(default_factory=list)


@dataclass
class CodeGenResult:
    """Result from code generation."""
    file_changes: list[FileChange]
    files_created: int
    files_modified: int
    total_lines: int
    needs_validation: bool = True


CODE_GEN_SYSTEM_PROMPT = """You are an expert full-stack developer generating production code for a SaaS application.

## Template Structure
The app is built on a production template with:
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Python 3.11 Lambda handlers
- **Database**: DynamoDB (single-table design)
- **Auth**: Clerk
- **Payments**: Stripe

## Code Generation Rules

### Frontend (frontend/src/...)
- Use TypeScript strictly (no `any` types)
- Use shadcn/ui components from `@/components/ui/*`
- Use Tailwind for styling (no CSS files)
- Pages go in `app/` directory
- Reusable components go in `components/`
- API calls use fetch to `process.env.NEXT_PUBLIC_API_BASE_URL`
- Use Clerk's `useUser()` and `useAuth()` for auth

### Backend (backend/lambdas/api/...)
- Python 3.11 with type hints
- Use existing helpers from `common/` (dynamodb, http, logging)
- Handlers follow the pattern in existing handlers
- Use DynamoDB single-table patterns

### Code Style
- Clean, readable code with meaningful names
- No comments unless logic is genuinely complex
- Handle errors gracefully
- Follow existing patterns in the codebase

## Output Format
Generate each file separately using this format:

```file:path/to/file.tsx
// Full file content here
```

```file:another/file.py
# Full file content here
```

Generate files in this order:
1. Types/interfaces (frontend/src/types/...)
2. Backend handlers (backend/lambdas/api/...)
3. UI components (frontend/src/components/...)
4. Pages (frontend/src/app/...)

IMPORTANT: Generate complete, working files. No placeholders or TODOs."""


FIX_ERRORS_PROMPT = """The generated code had validation errors. Fix the issues and regenerate ONLY the affected files.

## Errors Found:
{errors}

## Files to Fix:
{files}

## Original Spec (for context):
{spec}

Regenerate the fixed files using the same format:
```file:path/to/file.tsx
// Fixed content
```

Only output the files that need fixing. Ensure they compile without errors."""


class CodeGeneratorAgent(Agent[CodeGenState, CodeGenResult]):
    """
    Agent that generates code from specifications.
    Designed to work with ValidatorAgent for iterative fixing.
    """

    name = "code_generator"
    description = "Generates production code from specifications"

    def create_initial_state(
        self,
        spec_yaml: str = "",
        project_name: str = "",
        template_id: str = "",
        skeleton_manifest: Optional[list[str]] = None,
        template_context: str = "",
        **kwargs
    ) -> CodeGenState:
        return CodeGenState(
            spec_yaml=spec_yaml,
            project_name=project_name,
            template_id=template_id,
            skeleton_manifest=skeleton_manifest or [],
            template_context=template_context,
            max_iterations=5,  # Allow several fix attempts
        )

    def _build_generation_prompt(self, state: CodeGenState) -> str:
        manifest_text = ""
        if state.skeleton_manifest:
            # Show relevant files only
            relevant = [
                f for f in state.skeleton_manifest[:100]
                if not any(skip in f for skip in ["node_modules", ".next", ".git", "__pycache__"])
            ]
            manifest_text = "\n".join(relevant)

        return f"""## Project: {state.project_name}

## Existing Template Files:
{manifest_text}

## Specification to Implement:
```yaml
{state.spec_yaml}
```

Generate all necessary files to implement this specification.
Follow the rules in your system prompt carefully."""

    def _build_fix_prompt(self, state: CodeGenState) -> str:
        return FIX_ERRORS_PROMPT.format(
            errors="\n".join(state.validation_errors),
            files=", ".join(state.files_to_fix),
            spec=state.spec_yaml[:2000],  # Truncate for context
        )

    def _parse_file_changes(self, response: str) -> list[FileChange]:
        """Parse file blocks from the response."""
        changes = []
        lines = response.split("\n")

        current_file = None
        current_content = []
        in_file_block = False

        for line in lines:
            # Check for file block start
            if line.startswith("```file:"):
                if current_file and current_content:
                    # Save previous file
                    changes.append(FileChange(
                        path=current_file,
                        action="create",  # We'll determine modify later
                        content="\n".join(current_content),
                    ))

                current_file = line[8:].strip()  # Remove ```file:
                current_content = []
                in_file_block = True
                continue

            # Check for block end
            if line.strip() == "```" and in_file_block:
                if current_file and current_content:
                    changes.append(FileChange(
                        path=current_file,
                        action="create",
                        content="\n".join(current_content),
                    ))
                current_file = None
                current_content = []
                in_file_block = False
                continue

            # Accumulate content
            if in_file_block and current_file:
                current_content.append(line)

        # Handle case where response ends without closing fence
        if current_file and current_content:
            changes.append(FileChange(
                path=current_file,
                action="create",
                content="\n".join(current_content),
            ))

        return changes

    def _determine_actions(
        self,
        changes: list[FileChange],
        manifest: list[str]
    ) -> list[FileChange]:
        """Determine if each change is create or modify based on manifest."""
        manifest_set = set(manifest)

        for change in changes:
            # Normalize path
            path = change.path.lstrip("/")
            if path in manifest_set or f"/{path}" in manifest_set:
                change.action = "modify"
            else:
                change.action = "create"

        return changes

    def _count_lines(self, changes: list[FileChange]) -> int:
        return sum(len(c.content.split("\n")) for c in changes)

    async def run(
        self,
        state: CodeGenState,
        user_id: str = "",
        **kwargs
    ) -> AgentResult[CodeGenResult]:
        """
        Generate code from the specification.
        """
        # Determine if this is initial generation or a fix iteration
        is_fix_iteration = bool(state.validation_errors and state.files_to_fix)

        if is_fix_iteration:
            prompt = self._build_fix_prompt(state)
        else:
            prompt = self._build_generation_prompt(state)

        try:
            response = self.ai.generate(
                prompt=prompt,
                user_id=user_id,
                system=CODE_GEN_SYSTEM_PROMPT,
                temperature=0.2,
                max_tokens=8000,
            )

            # Parse file changes
            new_changes = self._parse_file_changes(response)

            if not new_changes:
                return AgentResult(
                    success=False,
                    error="No files generated. The AI response may not have followed the expected format.",
                    should_continue=state.iteration < state.max_iterations,
                )

            # Determine create vs modify
            new_changes = self._determine_actions(new_changes, state.skeleton_manifest)

            if is_fix_iteration:
                # Merge fixes with existing changes
                existing_paths = {c.path for c in state.file_changes}
                fixed_paths = {c.path for c in new_changes}

                # Keep non-fixed files, replace fixed ones
                state.file_changes = [
                    c for c in state.file_changes
                    if c.path not in fixed_paths
                ] + new_changes
            else:
                state.file_changes = new_changes

            # Clear validation errors for next round
            state.validation_errors = []
            state.files_to_fix = []
            state.update()

            created = sum(1 for c in state.file_changes if c.action == "create")
            modified = sum(1 for c in state.file_changes if c.action == "modify")

            result = CodeGenResult(
                file_changes=state.file_changes,
                files_created=created,
                files_modified=modified,
                total_lines=self._count_lines(state.file_changes),
                needs_validation=True,
            )

            return AgentResult(
                success=True,
                data=result,
                should_continue=False,  # Validation happens externally
                next_action="validate",
            )

        except Exception as exc:
            state.add_error(str(exc))
            return AgentResult(
                success=False,
                error=str(exc),
                should_continue=state.iteration < state.max_iterations,
            )

    def apply_validation_feedback(
        self,
        state: CodeGenState,
        errors: list[str],
        files_with_errors: list[str]
    ) -> None:
        """
        Apply validation feedback to state for next iteration.
        Called by orchestrator after validation fails.
        """
        state.validation_errors = errors
        state.files_to_fix = files_with_errors
        state.update()
