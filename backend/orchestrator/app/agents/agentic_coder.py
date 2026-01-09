"""
AgenticCoder - Code generator that uses tool calling to explore and modify code.

This is the "Cursor/Claude Code"-like experience:
- Model can read files to understand existing code
- Model can search for patterns/exports
- Model writes files incrementally
- Compile errors are fed back for repair
- Loops until successful build or max iterations
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any, Optional

import boto3
from botocore.config import Config

from .workspace import Workspace, WORKSPACE_TOOLS, execute_workspace_tool


@dataclass
class AgenticCoderConfig:
    """Configuration for the agentic coder.

    model_id is loaded from BEDROCK_MODEL_ID env var (set in Terraform).
    """
    model_id: str = ""  # Set from env var in __post_init__
    max_tokens: int = 8192
    temperature: float = 0.2
    max_iterations: int = 20  # Max tool calls per generation
    max_repair_attempts: int = 3  # Max times to retry after compile errors

    def __post_init__(self):
        if not self.model_id:
            self.model_id = os.getenv("BEDROCK_MODEL_ID", "")


@dataclass
class GenerationResult:
    """Result from code generation."""
    success: bool
    files_changed: list[str] = field(default_factory=list)
    summary: str = ""
    error: Optional[str] = None
    iterations: int = 0
    compile_output: str = ""


AGENTIC_SYSTEM_PROMPT = """You are an expert full-stack developer building a SaaS application.

## Your Capabilities
You have tools to explore and modify the codebase:
- `list_files(prefix)` - See what files exist
- `read_file(path)` - Read file contents
- `search(pattern)` - Find code patterns
- `write_file(path, content)` - Create or update files
- `get_exports(path)` - See what a module exports
- `finish(summary)` - Signal completion

## How to Work
1. FIRST explore the existing code to understand what's available
2. Check what UI components exist: `list_files("frontend/src/components/ui")`
3. Read key files like `frontend/src/lib/api.ts` and `frontend/src/types/index.ts`
4. THEN write your code, using only imports that actually exist

## Critical Rules
- ALWAYS read a file before importing from it (verify exports exist)
- UI components are in `frontend/src/components/ui/` - check what's there!
- Put YOUR components in `frontend/src/components/app/` (NOT ui/)
- Put YOUR types in `frontend/src/types/app-types.ts` (NOT index.ts!)
- All React components with hooks need `"use client";` as the FIRST line
- Use lucide-react for icons, NOT <img> tags

## For Preview Builds
- There is NO backend - use useState with mock data
- Make it look GOOD with Tailwind - gradients, shadows, spacing
- Use REALISTIC mock data, not empty values
- Make it INTERACTIVE with click handlers and state

## Output
When you're done writing all files, call `finish(summary)` with a brief description.
"""


REPAIR_PROMPT_TEMPLATE = """The build failed with these errors:

```
{errors}
```

Please fix the issues. You can:
1. `read_file` to see the current state of problematic files
2. `search` to find related code
3. `write_file` to fix the files

Common fixes:
- Missing "use client" directive → Add it as the first line
- Import not found → Check what the module actually exports with `get_exports`
- Type errors → Read the file and fix the types

Fix the errors and call `finish(summary)` when done.
"""


class AgenticCoder:
    """
    Code generator that uses Claude tool calling.

    This provides the "agentic" experience where the model can:
    - Explore the codebase
    - Read existing files
    - Write new code
    - Fix errors based on compiler output
    """

    def __init__(self, config: Optional[AgenticCoderConfig] = None):
        self.config = config or AgenticCoderConfig()
        # boto3 uses AWS_REGION env var automatically, but Opus-class models can exceed
        # default botocore read timeouts for large prompts. Make timeouts configurable.
        read_timeout = int(os.getenv("BEDROCK_READ_TIMEOUT_SECONDS", "300"))
        connect_timeout = int(os.getenv("BEDROCK_CONNECT_TIMEOUT_SECONDS", "10"))
        retries_max = int(os.getenv("BEDROCK_MAX_ATTEMPTS", "3"))
        cfg = Config(
            read_timeout=read_timeout,
            connect_timeout=connect_timeout,
            retries={"max_attempts": retries_max, "mode": "standard"},
        )
        self.bedrock = boto3.client("bedrock-runtime", config=cfg)

        if not self.config.model_id:
            raise RuntimeError("BEDROCK_MODEL_ID env var is required")

    def _call_claude(
        self,
        messages: list[dict],
        system: str,
    ) -> dict:
        """
        Call Claude via Bedrock Converse API with tools.

        Returns the full response from Bedrock.
        """
        # Convert tools to Bedrock format
        tool_config = {
            "tools": [
                {
                    "toolSpec": {
                        "name": tool["name"],
                        "description": tool["description"],
                        "inputSchema": {"json": tool["input_schema"]}
                    }
                }
                for tool in WORKSPACE_TOOLS
            ]
        }

        response = self.bedrock.converse(
            modelId=self.config.model_id,
            messages=messages,
            system=[{"text": system}],
            toolConfig=tool_config,
            inferenceConfig={
                "maxTokens": self.config.max_tokens,
                "temperature": self.config.temperature,
            }
        )

        return response

    def _extract_tool_calls(self, response: dict) -> list[dict]:
        """Extract tool calls from Bedrock response."""
        tool_calls = []

        output = response.get("output", {})
        message = output.get("message", {})
        content = message.get("content", [])

        for block in content:
            if "toolUse" in block:
                tool_use = block["toolUse"]
                tool_calls.append({
                    "id": tool_use.get("toolUseId", ""),
                    "name": tool_use.get("name", ""),
                    "input": tool_use.get("input", {}),
                })

        return tool_calls

    def _extract_text(self, response: dict) -> str:
        """Extract text content from Bedrock response."""
        output = response.get("output", {})
        message = output.get("message", {})
        content = message.get("content", [])

        texts = []
        for block in content:
            if "text" in block:
                texts.append(block["text"])

        return "\n".join(texts)

    def _format_tool_result(self, tool_id: str, result: dict) -> dict:
        """Format a tool result for sending back to Claude."""
        content = json.dumps(result) if isinstance(result, (dict, list)) else str(result)

        return {
            "toolUseId": tool_id,
            "content": [{"text": content}]
        }

    async def generate(
        self,
        workspace: Workspace,
        spec_yaml: str,
        project_name: str = "",
        user_id: str = "",
    ) -> GenerationResult:
        """
        Generate code using the agentic loop.

        Args:
            workspace: The workspace to operate on
            spec_yaml: The specification to implement
            project_name: Name of the project
            user_id: User ID for logging

        Returns:
            GenerationResult with files changed and status
        """
        # Build initial prompt
        user_prompt = f"""## Project: {project_name}

## Specification
```yaml
{spec_yaml}
```

Please implement this specification. Start by exploring the existing codebase to understand what's available, then write the necessary files.
"""

        messages = [{"role": "user", "content": [{"text": user_prompt}]}]
        files_changed: list[str] = []
        iterations = 0

        # Main tool-calling loop
        while iterations < self.config.max_iterations:
            iterations += 1

            try:
                response = self._call_claude(messages, AGENTIC_SYSTEM_PROMPT)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    error=f"Claude API error: {e}",
                    iterations=iterations,
                )

            stop_reason = response.get("stopReason", "")
            tool_calls = self._extract_tool_calls(response)

            # Add assistant message to history
            assistant_content = response.get("output", {}).get("message", {}).get("content", [])
            messages.append({"role": "assistant", "content": assistant_content})

            # Check if we're done
            if stop_reason == "end_turn" and not tool_calls:
                # Model finished without calling finish tool
                text = self._extract_text(response)
                return GenerationResult(
                    success=True,
                    files_changed=files_changed,
                    summary=text[:500] if text else "Generation complete",
                    iterations=iterations,
                )

            if not tool_calls:
                continue

            # Execute tools and collect results
            tool_results = []
            finished = False
            finish_summary = ""

            for tool_call in tool_calls:
                tool_name = tool_call["name"]
                tool_input = tool_call["input"]
                tool_id = tool_call["id"]

                # Execute the tool
                result = execute_workspace_tool(workspace, tool_name, tool_input)

                # Track file changes
                if tool_name == "write_file" and result.get("success"):
                    path = tool_input.get("path", "")
                    if path and path not in files_changed:
                        files_changed.append(path)

                # Check for finish signal
                if tool_name == "finish" and result.get("success"):
                    finished = True
                    finish_summary = result.get("result", "")

                tool_results.append(self._format_tool_result(tool_id, result))

            # Add tool results to messages
            messages.append({
                "role": "user",
                "content": [{"toolResult": tr} for tr in tool_results]
            })

            if finished:
                return GenerationResult(
                    success=True,
                    files_changed=files_changed,
                    summary=finish_summary,
                    iterations=iterations,
                )

        # Max iterations reached
        return GenerationResult(
            success=False,
            error=f"Max iterations ({self.config.max_iterations}) reached",
            files_changed=files_changed,
            iterations=iterations,
        )

    async def repair(
        self,
        workspace: Workspace,
        compile_errors: str,
        previous_messages: Optional[list[dict]] = None,
    ) -> GenerationResult:
        """
        Repair code based on compile errors.

        Args:
            workspace: The workspace with current code
            compile_errors: Error output from the build
            previous_messages: Optional conversation history to continue

        Returns:
            GenerationResult with repair status
        """
        repair_prompt = REPAIR_PROMPT_TEMPLATE.format(errors=compile_errors)

        if previous_messages:
            messages = previous_messages + [{"role": "user", "content": [{"text": repair_prompt}]}]
        else:
            messages = [{"role": "user", "content": [{"text": repair_prompt}]}]

        files_changed: list[str] = []
        iterations = 0

        # Repair loop (similar to generate)
        while iterations < self.config.max_iterations:
            iterations += 1

            try:
                response = self._call_claude(messages, AGENTIC_SYSTEM_PROMPT)
            except Exception as e:
                return GenerationResult(
                    success=False,
                    error=f"Claude API error: {e}",
                    iterations=iterations,
                )

            stop_reason = response.get("stopReason", "")
            tool_calls = self._extract_tool_calls(response)

            assistant_content = response.get("output", {}).get("message", {}).get("content", [])
            messages.append({"role": "assistant", "content": assistant_content})

            if stop_reason == "end_turn" and not tool_calls:
                text = self._extract_text(response)
                return GenerationResult(
                    success=True,
                    files_changed=files_changed,
                    summary=text[:500] if text else "Repair complete",
                    iterations=iterations,
                )

            if not tool_calls:
                continue

            tool_results = []
            finished = False
            finish_summary = ""

            for tool_call in tool_calls:
                tool_name = tool_call["name"]
                tool_input = tool_call["input"]
                tool_id = tool_call["id"]

                result = execute_workspace_tool(workspace, tool_name, tool_input)

                if tool_name == "write_file" and result.get("success"):
                    path = tool_input.get("path", "")
                    if path and path not in files_changed:
                        files_changed.append(path)

                if tool_name == "finish" and result.get("success"):
                    finished = True
                    finish_summary = result.get("result", "")

                tool_results.append(self._format_tool_result(tool_id, result))

            messages.append({
                "role": "user",
                "content": [{"toolResult": tr} for tr in tool_results]
            })

            if finished:
                return GenerationResult(
                    success=True,
                    files_changed=files_changed,
                    summary=finish_summary,
                    iterations=iterations,
                )

        return GenerationResult(
            success=False,
            error=f"Max iterations ({self.config.max_iterations}) reached during repair",
            files_changed=files_changed,
            iterations=iterations,
        )


async def run_agentic_generation(
    spec_yaml: str,
    project_name: str,
    template_path: str,
    user_id: str = "",
    model_id: Optional[str] = None,
    run_compile: bool = True,
) -> GenerationResult:
    """
    High-level function to run agentic code generation with compile loop.

    Args:
        spec_yaml: The specification to implement
        project_name: Name of the project
        template_path: Path to the base template
        user_id: User ID for logging
        model_id: Optional model ID override
        run_compile: Whether to run compile validation

    Returns:
        GenerationResult with final status
    """
    config = AgenticCoderConfig()
    if model_id:
        config.model_id = model_id

    coder = AgenticCoder(config)

    # Create workspace from template
    with Workspace(template_path=template_path) as workspace:
        # Initial generation
        result = await coder.generate(
            workspace=workspace,
            spec_yaml=spec_yaml,
            project_name=project_name,
            user_id=user_id,
        )

        if not result.success:
            return result

        if not run_compile:
            return result

        # Run compile validation
        from .validator_agent import ValidatorAgent
        from .code_agent import FileChange

        # Get files from workspace
        all_files = workspace.get_all_files_content()
        file_changes = [
            FileChange(path=path, content=content, action="create")
            for path, content in all_files.items()
        ]

        validator = ValidatorAgent()
        try:
            val_state = validator.create_initial_state(
                file_changes=file_changes,
                skeleton_path=template_path,
                run_full_build=True,
            )
            val_result = await validator.run(val_state)

            if val_result.success and val_result.data and val_result.data.is_valid:
                result.compile_output = "Build succeeded"
                return result

            # Build failed - attempt repair
            compile_errors = val_state.build_output or "Build failed"
            result.compile_output = compile_errors

            for attempt in range(config.max_repair_attempts):
                repair_result = await coder.repair(
                    workspace=workspace,
                    compile_errors=compile_errors,
                )

                if not repair_result.success:
                    result.error = repair_result.error
                    return result

                result.files_changed.extend(repair_result.files_changed)
                result.iterations += repair_result.iterations

                # Re-run validation
                all_files = workspace.get_all_files_content()
                file_changes = [
                    FileChange(path=path, content=content, action="create")
                    for path, content in all_files.items()
                ]

                val_state = validator.create_initial_state(
                    file_changes=file_changes,
                    skeleton_path=template_path,
                    run_full_build=True,
                )
                val_result = await validator.run(val_state)

                if val_result.success and val_result.data and val_result.data.is_valid:
                    result.compile_output = "Build succeeded after repair"
                    result.summary = f"Fixed in {attempt + 1} repair attempt(s)"
                    return result

                compile_errors = val_state.build_output or "Build still failing"
                result.compile_output = compile_errors

            # Max repair attempts reached
            result.success = False
            result.error = f"Build still failing after {config.max_repair_attempts} repair attempts"
            return result

        finally:
            validator.cleanup()
