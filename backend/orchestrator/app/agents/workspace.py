"""
Workspace - Manages the current project state for agentic code generation.

The workspace represents the "working tree" of a project:
- Initialized from base template
- Updated with generated changes
- Provides tools for the AI to read/write/search files
- Persists between iterations so the model can see its own changes
"""

from __future__ import annotations

import os
import re
import shutil
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


@dataclass
class FileInfo:
    """Information about a file in the workspace."""
    path: str
    size: int
    is_directory: bool


@dataclass
class SearchResult:
    """Result from searching the workspace."""
    path: str
    line_number: int
    line_content: str
    match: str


class Workspace:
    """
    Manages the current project state.

    This is the "working tree" that tools operate on. It starts from
    the base template and accumulates changes across iterations.
    """

    def __init__(
        self,
        template_path: Optional[str] = None,
        working_dir: Optional[str] = None,
    ):
        """
        Initialize workspace.

        Args:
            template_path: Path to base template to copy from
            working_dir: Optional existing working directory to use
        """
        self.template_path = Path(template_path) if template_path else None
        self._temp_dir: Optional[tempfile.TemporaryDirectory] = None

        if working_dir:
            self.root = Path(working_dir)
        else:
            # Create temp directory for workspace
            self._temp_dir = tempfile.TemporaryDirectory(prefix="workspace_")
            self.root = Path(self._temp_dir.name)

            # Copy template if provided
            if self.template_path and self.template_path.exists():
                self._copy_template()

    def _copy_template(self) -> None:
        """Copy template files to workspace."""
        if not self.template_path:
            return

        # Copy frontend/src directory (the main code we care about)
        frontend_src = self.template_path / "frontend" / "src"
        if frontend_src.exists():
            dest = self.root / "frontend" / "src"
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(frontend_src, dest, dirs_exist_ok=True)

        # Copy key config files
        for config_file in ["package.json", "tsconfig.json", "next.config.js", "next.config.ts", "tailwind.config.ts"]:
            src = self.template_path / "frontend" / config_file
            if src.exists():
                dest = self.root / "frontend" / config_file
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dest)

    def cleanup(self) -> None:
        """Clean up temporary workspace."""
        if self._temp_dir:
            self._temp_dir.cleanup()
            self._temp_dir = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.cleanup()

    # =========================================================================
    # Tool implementations - these are what the AI can call
    # =========================================================================

    def list_files(self, prefix: str = "", include_content_preview: bool = False) -> list[FileInfo]:
        """
        List files in the workspace.

        Args:
            prefix: Optional path prefix to filter (e.g., "frontend/src/components")
            include_content_preview: Whether to include first few lines

        Returns:
            List of FileInfo objects
        """
        results = []
        search_path = self.root / prefix if prefix else self.root

        if not search_path.exists():
            return results

        for item in search_path.rglob("*"):
            # Skip common non-code directories
            rel_path = item.relative_to(self.root)
            path_str = str(rel_path)

            if any(skip in path_str for skip in ["node_modules", ".next", ".git", "__pycache__", ".DS_Store"]):
                continue

            results.append(FileInfo(
                path=path_str,
                size=item.stat().st_size if item.is_file() else 0,
                is_directory=item.is_dir(),
            ))

        # Sort: directories first, then files alphabetically
        results.sort(key=lambda f: (not f.is_directory, f.path))
        return results

    def read_file(self, path: str) -> Optional[str]:
        """
        Read a file from the workspace.

        Args:
            path: Relative path to the file

        Returns:
            File contents or None if file doesn't exist
        """
        file_path = self.root / path

        if not file_path.exists() or not file_path.is_file():
            return None

        try:
            return file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return None

    def write_file(self, path: str, content: str) -> bool:
        """
        Write a file to the workspace.

        Args:
            path: Relative path to the file
            content: File contents

        Returns:
            True if successful
        """
        file_path = self.root / path

        try:
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")
            return True
        except Exception:
            return False

    def delete_file(self, path: str) -> bool:
        """
        Delete a file from the workspace.

        Args:
            path: Relative path to the file

        Returns:
            True if successful
        """
        file_path = self.root / path

        try:
            if file_path.exists():
                file_path.unlink()
            return True
        except Exception:
            return False

    def search(self, pattern: str, file_pattern: str = "*.{ts,tsx,py}") -> list[SearchResult]:
        """
        Search for a pattern in workspace files.

        Args:
            pattern: Regex or substring to search for
            file_pattern: Glob pattern for files to search

        Returns:
            List of SearchResult objects
        """
        results = []

        # Convert simple glob to multiple patterns
        patterns = []
        if "{" in file_pattern:
            # Handle {ts,tsx} style patterns
            base, ext_part = file_pattern.rsplit(".", 1)
            if ext_part.startswith("{") and ext_part.endswith("}"):
                exts = ext_part[1:-1].split(",")
                patterns = [f"{base}.{ext}" for ext in exts]
        else:
            patterns = [file_pattern]

        # Compile regex
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            # Fall back to literal search if invalid regex
            regex = re.compile(re.escape(pattern), re.IGNORECASE)

        # Search files
        for glob_pattern in patterns:
            for file_path in self.root.rglob(glob_pattern):
                rel_path = str(file_path.relative_to(self.root))

                # Skip non-code directories
                if any(skip in rel_path for skip in ["node_modules", ".next", ".git", "__pycache__"]):
                    continue

                try:
                    content = file_path.read_text(encoding="utf-8", errors="ignore")
                    for i, line in enumerate(content.split("\n"), 1):
                        match = regex.search(line)
                        if match:
                            results.append(SearchResult(
                                path=rel_path,
                                line_number=i,
                                line_content=line.strip()[:200],  # Truncate long lines
                                match=match.group(0),
                            ))
                except Exception:
                    continue

        return results[:100]  # Limit results

    def file_exists(self, path: str) -> bool:
        """Check if a file exists in the workspace."""
        return (self.root / path).exists()

    def get_exports(self, path: str) -> list[str]:
        """
        Extract exported names from a TypeScript/JavaScript file.

        Args:
            path: Relative path to the file

        Returns:
            List of exported names
        """
        content = self.read_file(path)
        if not content:
            return []

        exports = []

        # Match: export const/function/class Name
        pattern1 = r'export\s+(?:const|function|class|type|interface)\s+(\w+)'
        exports.extend(re.findall(pattern1, content))

        # Match: export { Name, Name2 }
        pattern2 = r'export\s*\{\s*([^}]+)\s*\}'
        for match in re.finditer(pattern2, content):
            names = match.group(1).split(",")
            for name in names:
                name = name.strip()
                if " as " in name:
                    name = name.split(" as ")[1].strip()
                if name:
                    exports.append(name)

        # Match: export default
        if re.search(r'export\s+default', content):
            exports.append("default")

        return list(set(exports))

    def apply_changes(self, changes: list[dict]) -> list[str]:
        """
        Apply a batch of file changes.

        Args:
            changes: List of dicts with 'path', 'content', 'action' (create/modify/delete)

        Returns:
            List of paths that were changed
        """
        changed = []

        for change in changes:
            path = change.get("path", "")
            content = change.get("content", "")
            action = change.get("action", "create")

            if action == "delete":
                if self.delete_file(path):
                    changed.append(path)
            else:
                if self.write_file(path, content):
                    changed.append(path)

        return changed

    def get_all_files_content(self) -> dict[str, str]:
        """
        Get all file contents as a dict.
        Useful for creating bundles or diffs.
        """
        files = {}

        for file_info in self.list_files():
            if not file_info.is_directory:
                content = self.read_file(file_info.path)
                if content is not None:
                    files[file_info.path] = content

        return files


# =============================================================================
# Tool definitions for Claude API
# =============================================================================

WORKSPACE_TOOLS = [
    {
        "name": "list_files",
        "description": "List files and directories in the project workspace. Use this to explore the codebase structure.",
        "input_schema": {
            "type": "object",
            "properties": {
                "prefix": {
                    "type": "string",
                    "description": "Optional path prefix to filter results (e.g., 'frontend/src/components')"
                }
            },
            "required": []
        }
    },
    {
        "name": "read_file",
        "description": "Read the contents of a file. Use this to understand existing code before making changes.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file (e.g., 'frontend/src/lib/api.ts')"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "search",
        "description": "Search for a pattern across all code files. Use this to find usages, exports, or specific code patterns.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {
                    "type": "string",
                    "description": "Regex or substring to search for"
                },
                "file_pattern": {
                    "type": "string",
                    "description": "Glob pattern for files to search (default: '*.{ts,tsx,py}')"
                }
            },
            "required": ["pattern"]
        }
    },
    {
        "name": "write_file",
        "description": "Write or update a file in the workspace. Use this to create new files or modify existing ones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file"
                },
                "content": {
                    "type": "string",
                    "description": "Complete file content to write"
                }
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "get_exports",
        "description": "Get the exported names from a TypeScript/JavaScript file. Use this to check what can be imported from a module.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative path to the file"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "finish",
        "description": "Signal that you're done making changes. Call this when all files have been written and you're ready for the build to run.",
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "Brief summary of changes made"
                }
            },
            "required": ["summary"]
        }
    },
]


def execute_workspace_tool(workspace: Workspace, tool_name: str, tool_input: dict) -> dict:
    """
    Execute a workspace tool and return the result.

    Args:
        workspace: The workspace to operate on
        tool_name: Name of the tool to execute
        tool_input: Input parameters for the tool

    Returns:
        Dict with 'success' and 'result' or 'error'
    """
    try:
        if tool_name == "list_files":
            prefix = tool_input.get("prefix", "")
            files = workspace.list_files(prefix)
            return {
                "success": True,
                "result": [{"path": f.path, "is_directory": f.is_directory, "size": f.size} for f in files]
            }

        elif tool_name == "read_file":
            path = tool_input.get("path", "")
            content = workspace.read_file(path)
            if content is None:
                return {"success": False, "error": f"File not found: {path}"}
            return {"success": True, "result": content}

        elif tool_name == "search":
            pattern = tool_input.get("pattern", "")
            file_pattern = tool_input.get("file_pattern", "*.{ts,tsx,py}")
            results = workspace.search(pattern, file_pattern)
            return {
                "success": True,
                "result": [
                    {"path": r.path, "line": r.line_number, "content": r.line_content, "match": r.match}
                    for r in results
                ]
            }

        elif tool_name == "write_file":
            path = tool_input.get("path", "")
            content = tool_input.get("content", "")
            success = workspace.write_file(path, content)
            if success:
                return {"success": True, "result": f"Successfully wrote {path}"}
            return {"success": False, "error": f"Failed to write {path}"}

        elif tool_name == "get_exports":
            path = tool_input.get("path", "")
            exports = workspace.get_exports(path)
            if not exports:
                return {"success": False, "error": f"No exports found or file not found: {path}"}
            return {"success": True, "result": exports}

        elif tool_name == "finish":
            summary = tool_input.get("summary", "")
            return {"success": True, "result": summary, "finished": True}

        else:
            return {"success": False, "error": f"Unknown tool: {tool_name}"}

    except Exception as e:
        return {"success": False, "error": str(e)}
