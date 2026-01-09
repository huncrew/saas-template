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
from .template_tools import get_template_context, TemplateContext


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
    template_path: str = ""  # Path to template directory for loading real file contents
    skeleton_manifest: list[str] = field(default_factory=list)  # Files in template
    template_context: str = ""
    additional_instructions: str = ""  # Extra instructions (e.g., from previous build failures)

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


CODE_GEN_BASE_PROMPT = """You are an expert full-stack developer generating production code for a SaaS application.

## Template Structure
The app is built on a production template with:
- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Python 3.11 Lambda handlers
- **Database**: DynamoDB (single-table design)
- **Auth**: Clerk (optional - app must work without it for previews)

## CRITICAL: Closed-World Import Rule
If you import something, you MUST either:
1. Import from an existing template file (see TEMPLATE CONTRACT below), OR
2. Generate the file yourself with the correct exports

DO NOT:
- Import custom components from @/components/ui/* (only use components listed in the contract)
- Import assets that don't exist (e.g., NO @/assets/logo.png)
- Import types without exporting them (if you use `type Foo`, ensure `export type Foo = ...`)
- Use bare imports like `from "@/components/ui"` - always specify the file

If you need a custom logo/icon, use lucide-react icons or inline SVG.

## CRITICAL: Files You Must NOT Overwrite
These files exist in the template and MUST NOT be replaced:
- frontend/src/types/index.ts (has User, Subscription, SubscriptionStatus types)
- frontend/src/lib/api.ts (has apiClient export)
- frontend/src/lib/subscription.ts
- frontend/src/app/dashboard/* (existing dashboard pages)
- Any file in frontend/src/components/ui/ that already exists

Instead, create NEW files for your types and components:
- Put app-specific types in: frontend/src/types/app-types.ts
- Put app components in: frontend/src/components/app/* (NOT components/ui)

## CRITICAL: Correct Imports
- For API calls: import { apiClient } from "@/lib/api" (NOT 'api' - that doesn't exist!)
- For your types: import { YourType } from "@/types/app-types"
- For UI components: import { Button } from "@/components/ui/button"

### Icons - Use lucide-react (already installed)
```typescript
import { Home, Settings, User, Search, Menu, X, ChevronDown, Plus, Trash, Edit, Check, AlertCircle, Info, Star, Heart, Mail, Phone, MapPin, Calendar, Clock, ArrowLeft, ArrowRight, ExternalLink, Download, Upload, Share, Copy, Loader2, Trophy, Target, TrendingUp, Users, Activity, Zap, Shield, Award } from "lucide-react"
```

### CRITICAL: No <img> tags for logos/icons
NEVER use <img src="..."> for logos or icons - the images don't exist!
Instead use:
- lucide-react icons (see above)
- Inline SVG
- Emoji as fallback
- Text/initials in a colored div

Example - instead of broken image:
```tsx
// ❌ WRONG - image doesn't exist
<img src="/arsenal-logo.png" alt="Arsenal" />

// ✅ CORRECT - use icon or styled div
<div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center text-white font-bold text-xl">A</div>
// or
<Shield className="w-12 h-12 text-red-600" />
```

## Code Generation Rules

### Frontend (frontend/src/...)
- Use TypeScript strictly (no `any` types)
- Import UI components from `@/components/ui/*` (e.g., `import { Button } from "@/components/ui/button"`)
- Use Tailwind for styling (no CSS files)
- Pages go in `app/` directory
- Reusable components go in `components/app/` (NOT components/ui - those are template components)

### CRITICAL: Preview builds have NO backend - use LOCAL STATE ONLY
This is a STATIC preview build. There is NO API server running. You MUST:
- Use useState() for ALL data (mock/hardcoded initial values)
- DO NOT call fetch(), apiClient, or any API endpoints
- Store everything in React state (it won't persist, that's fine for preview)

### CRITICAL: Use REALISTIC mock data - not empty/zero values!
Always initialize state with realistic, believable sample data:

```tsx
// ❌ WRONG - empty/zero values look broken
const [position, setPosition] = useState(0);
const [matches, setMatches] = useState([]);

// ✅ CORRECT - realistic mock data
const [teamData, setTeamData] = useState({
  position: 4,
  points: 52,
  wins: 16,
  draws: 4,
  losses: 6,
  recentResults: ["W", "W", "D", "W", "L"],
});

const [matches, setMatches] = useState([
  { id: 1, opponent: "Chelsea", date: "Jan 15, 2025", location: "Home", result: "2-1" },
  { id: 2, opponent: "Liverpool", date: "Jan 22, 2025", location: "Away", result: "Upcoming" },
  { id: 3, opponent: "Man City", date: "Feb 1, 2025", location: "Home", result: "Upcoming" },
]);
```

### CRITICAL: Use Tailwind for attractive styling
Make it look GOOD with colors, spacing, shadows:

```tsx
// ❌ WRONG - plain and ugly
<div>
  <h1>Team Status</h1>
  <p>Position: {position}</p>
</div>

// ✅ CORRECT - styled and attractive
<div className="bg-gradient-to-br from-red-600 to-red-800 rounded-2xl p-6 text-white shadow-xl">
  <h1 className="text-2xl font-bold mb-4 flex items-center gap-2">
    <Trophy className="w-6 h-6" />
    Team Status
  </h1>
  <div className="grid grid-cols-3 gap-4">
    <div className="bg-white/10 rounded-xl p-4 text-center">
      <div className="text-3xl font-bold">{teamData.position}</div>
      <div className="text-sm opacity-80">League Position</div>
    </div>
    {/* more stats... */}
  </div>
</div>
```

### Make it INTERACTIVE
Add click handlers, hover states, and state updates:
```tsx
const [selectedMatch, setSelectedMatch] = useState<number | null>(null);

<div
  onClick={() => setSelectedMatch(match.id)}
  className="cursor-pointer hover:bg-gray-50 transition-colors p-4 rounded-lg border"
>
  {match.opponent}
</div>
```

### CRITICAL: "use client" Directive
- ALL React components with hooks (useState, useEffect, useUser, etc.) MUST start with "use client";
- ALL pages in frontend/src/app/**/*.tsx that use ANY interactivity MUST have "use client"; as the FIRST LINE
- This is REQUIRED for Next.js 15 App Router - without it, the app will crash
- Format: The file must literally start with: "use client";
- Example:
  "use client";

  import { useState } from "react";
  // ... rest of component

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
1. Types/interfaces (frontend/src/types/app-types.ts - NOT index.ts!)
2. Backend handlers (backend/lambdas/api/...)
3. App components (frontend/src/components/app/... - NOT components/ui!)
4. Pages (frontend/src/app/... - but NOT dashboard pages!)

IMPORTANT:
- Generate complete, working files. No placeholders or TODOs.
- NEVER overwrite types/index.ts - create types/app-types.ts instead
- NEVER import 'api' from @/lib/api - import 'apiClient' instead
- For simple previews, use mock data instead of API calls"""


def build_system_prompt(template_context: Optional[TemplateContext] = None) -> str:
    """
    Build the full system prompt with dynamic template context.

    If template_context is provided, includes real file contents from the template.
    Otherwise, falls back to the base prompt only.
    """
    if template_context:
        dynamic_context = template_context.get_full_context_for_prompt()
        return f"{CODE_GEN_BASE_PROMPT}\n\n{dynamic_context}"
    return CODE_GEN_BASE_PROMPT


# Keep legacy constant for backwards compatibility
CODE_GEN_SYSTEM_PROMPT = CODE_GEN_BASE_PROMPT


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

    def __init__(self, ai_client: Optional[AIClient] = None, template_path: str = ""):
        super().__init__(ai_client)
        self.template_path = template_path
        self._template_context: Optional[TemplateContext] = None

        # Load template context if path provided
        if template_path:
            try:
                self._template_context = get_template_context(template_path)
            except Exception:
                pass  # Fall back to static prompt

    def create_initial_state(
        self,
        spec_yaml: str = "",
        project_name: str = "",
        template_id: str = "",
        template_path: str = "",
        skeleton_manifest: Optional[list[str]] = None,
        template_context: str = "",
        additional_instructions: str = "",
        **kwargs
    ) -> CodeGenState:
        # Load template context if not already loaded
        if template_path and not self._template_context:
            try:
                self._template_context = get_template_context(template_path)
            except Exception:
                pass

        return CodeGenState(
            spec_yaml=spec_yaml,
            project_name=project_name,
            template_id=template_id,
            template_path=template_path,
            skeleton_manifest=skeleton_manifest or [],
            template_context=template_context,
            additional_instructions=additional_instructions,
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

        # Include additional instructions from previous build failures
        extra_instructions = ""
        if state.additional_instructions:
            extra_instructions = f"""
## IMPORTANT - Previous Build Errors to Fix:
{state.additional_instructions}
"""

        return f"""## Project: {state.project_name}
{extra_instructions}
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

    def _fix_clerk_imports(self, changes: list[FileChange]) -> list[FileChange]:
        """
        Fix Clerk imports that use @clerk/nextjs (doesn't exist) to work without auth.
        For preview builds, we strip auth entirely since it won't work in static export.
        """
        import re

        for change in changes:
            if not change.path.startswith("frontend/src/"):
                continue
            if not (change.path.endswith(".tsx") or change.path.endswith(".ts")):
                continue

            content = change.content

            # Remove @clerk/nextjs imports entirely
            content = re.sub(
                r'^import\s+\{[^}]*\}\s+from\s+["\']@clerk/nextjs["\'];?\s*\n?',
                '',
                content,
                flags=re.MULTILINE
            )

            # Replace useUser() calls with a mock that returns null
            # This makes the code work without auth
            if 'useUser' in content and '@clerk' not in content:
                # Add a mock useUser if it's used but import was removed
                mock_hook = 'const useUser = () => ({ user: null, isLoaded: true, isSignedIn: false });\n'
                if '"use client"' in content:
                    content = content.replace('"use client";\n', '"use client";\n\n' + mock_hook, 1)
                elif "'use client'" in content:
                    content = content.replace("'use client';\n", "'use client';\n\n" + mock_hook, 1)
                else:
                    content = mock_hook + content

            # Remove userId references that would be undefined
            content = re.sub(r'userId=\{userId\}', '', content)
            content = re.sub(r'const\s+\{\s*userId\s*\}\s*=\s*useUser\(\);?\s*\n?', '', content)

            change.content = content

        return changes

    def _ensure_use_client(self, changes: list[FileChange]) -> list[FileChange]:
        """
        Ensure frontend React files have 'use client' directive when needed.
        This is CRITICAL for Next.js 15 App Router compatibility.
        """
        # Patterns that indicate client-side code
        client_indicators = [
            "useState", "useEffect", "useRef", "useCallback", "useMemo",
            "useContext", "useReducer", "useLayoutEffect",
            "onClick", "onChange", "onSubmit", "onBlur", "onFocus",  # Event handlers
            "useRouter", "usePathname", "useSearchParams",  # Next.js client hooks
        ]

        for change in changes:
            # Only process frontend TypeScript/TSX files
            if not change.path.startswith("frontend/src/"):
                continue
            if not (change.path.endswith(".tsx") or change.path.endswith(".ts")):
                continue

            content = change.content.strip()

            # Check if file already has "use client"
            if content.startswith('"use client"') or content.startswith("'use client'"):
                continue

            # Check if file needs "use client"
            needs_use_client = any(indicator in content for indicator in client_indicators)

            if needs_use_client:
                # Prepend "use client"; directive
                change.content = '"use client";\n\n' + content

        return changes

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
            # Build system prompt with dynamic template context
            system_prompt = build_system_prompt(self._template_context)

            response = self.ai.generate(
                prompt=prompt,
                user_id=user_id,
                system=system_prompt,
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

            # CRITICAL: Ensure "use client" directive on frontend files
            new_changes = self._ensure_use_client(new_changes)

            # Fix @clerk/nextjs imports (package doesn't exist, strip for preview)
            new_changes = self._fix_clerk_imports(new_changes)

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
