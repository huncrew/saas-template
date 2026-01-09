"""
Pre-build validator - catches common errors before triggering CodeBuild.

This runs in Python and validates generated code for common issues:
- Import statements that won't resolve
- Broken image tags
- Missing exports
- Basic syntax issues
"""

import re
from dataclasses import dataclass, field
from typing import Optional


# Known UI components in the template
KNOWN_UI_COMPONENTS = {
    "accordion", "alert", "avatar", "badge", "button", "card", "carousel",
    "checkbox", "dialog", "dropdown-menu", "form", "input", "label", "popover",
    "progress", "radio-group", "scroll-area", "select", "separator", "sheet",
    "skeleton", "slider", "sonner", "switch", "table", "tabs", "textarea", "tooltip"
}

# Known template files that can be imported
KNOWN_TEMPLATE_FILES = {
    "@/lib/api": ["apiClient"],
    "@/lib/utils": ["cn"],
    "@/types": ["User", "Subscription", "PricingPlan", "APIResponse", "SubscriptionStatus"],
    "@/types/index": ["User", "Subscription", "PricingPlan", "APIResponse", "SubscriptionStatus"],
}

# lucide-react icons (common ones)
KNOWN_LUCIDE_ICONS = {
    "Home", "Settings", "User", "Search", "Menu", "X", "ChevronDown", "ChevronUp",
    "ChevronLeft", "ChevronRight", "Plus", "Minus", "Trash", "Edit", "Check",
    "AlertCircle", "Info", "Star", "Heart", "Mail", "Phone", "MapPin", "Calendar",
    "Clock", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "ExternalLink",
    "Download", "Upload", "Share", "Copy", "Loader2", "Trophy", "Target",
    "TrendingUp", "TrendingDown", "Users", "Activity", "Zap", "Shield", "Award",
    "Bell", "Eye", "EyeOff", "Lock", "Unlock", "Filter", "RefreshCw", "MoreHorizontal",
    "MoreVertical", "Send", "MessageCircle", "Image", "File", "Folder", "Play",
    "Pause", "Square", "Circle", "CheckCircle", "XCircle", "AlertTriangle",
}


@dataclass
class ValidationError:
    """A single validation error."""
    file_path: str
    line_number: Optional[int]
    error_type: str
    message: str
    suggestion: str


@dataclass
class ValidationResult:
    """Result of pre-build validation."""
    valid: bool
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[ValidationError] = field(default_factory=list)

    def add_error(self, file_path: str, line_number: Optional[int], error_type: str, message: str, suggestion: str):
        self.errors.append(ValidationError(file_path, line_number, error_type, message, suggestion))
        self.valid = False

    def add_warning(self, file_path: str, line_number: Optional[int], error_type: str, message: str, suggestion: str):
        self.warnings.append(ValidationError(file_path, line_number, error_type, message, suggestion))

    def to_error_string(self) -> str:
        """Convert errors to a string for the AI."""
        lines = []
        for e in self.errors[:5]:  # Limit to 5 errors
            lines.append(f"[{e.error_type}] {e.file_path}:{e.line_number or '?'}")
            lines.append(f"  Error: {e.message}")
            lines.append(f"  Fix: {e.suggestion}")
            lines.append("")
        return "\n".join(lines)


def validate_file(file_path: str, content: str, all_generated_files: set[str]) -> list[ValidationError]:
    """Validate a single file for common issues."""
    errors = []
    lines = content.split("\n")

    # Only validate TypeScript/TSX files
    if not (file_path.endswith(".ts") or file_path.endswith(".tsx")):
        return errors

    for i, line in enumerate(lines, 1):
        # Check for broken image tags
        img_match = re.search(r'<img\s+[^>]*src=["\']([^"\']+)["\']', line)
        if img_match:
            src = img_match.group(1)
            if not src.startswith("http") and not src.startswith("data:"):
                errors.append(ValidationError(
                    file_path=file_path,
                    line_number=i,
                    error_type="BROKEN_IMAGE",
                    message=f"Image src '{src}' references a local file that doesn't exist",
                    suggestion="Use lucide-react icons, inline SVG, or a colored div with initials instead"
                ))

        # Check for imports
        import_match = re.search(r'import\s+\{([^}]+)\}\s+from\s+["\']([^"\']+)["\']', line)
        if import_match:
            imports = [i.strip() for i in import_match.group(1).split(",")]
            from_path = import_match.group(2)

            # Check UI component imports
            if from_path.startswith("@/components/ui/"):
                component_name = from_path.replace("@/components/ui/", "")
                if component_name not in KNOWN_UI_COMPONENTS:
                    errors.append(ValidationError(
                        file_path=file_path,
                        line_number=i,
                        error_type="UNKNOWN_UI_COMPONENT",
                        message=f"UI component '{component_name}' doesn't exist in the template",
                        suggestion=f"Use one of: {', '.join(sorted(KNOWN_UI_COMPONENTS)[:10])}..."
                    ))

            # Check bare @/components/ui import (missing specific file)
            if from_path == "@/components/ui":
                errors.append(ValidationError(
                    file_path=file_path,
                    line_number=i,
                    error_type="INVALID_IMPORT",
                    message="Cannot import from '@/components/ui' directly",
                    suggestion="Import from specific file: import { Button } from '@/components/ui/button'"
                ))

            # Check @/lib/api imports
            if from_path == "@/lib/api":
                for imp in imports:
                    imp_name = imp.split(" as ")[0].strip()
                    if imp_name not in ["apiClient", "ApiClient"]:
                        errors.append(ValidationError(
                            file_path=file_path,
                            line_number=i,
                            error_type="UNKNOWN_EXPORT",
                            message=f"'{imp_name}' is not exported from @/lib/api",
                            suggestion="Only 'apiClient' is exported. For custom API calls, use fetch() directly"
                        ))

            # Check for imports from files that should be generated
            if from_path.startswith("@/") and not from_path.startswith("@/components/ui/"):
                # Convert import path to file path
                possible_paths = [
                    from_path.replace("@/", "frontend/src/") + ".ts",
                    from_path.replace("@/", "frontend/src/") + ".tsx",
                    from_path.replace("@/", "frontend/src/") + "/index.ts",
                    from_path.replace("@/", "frontend/src/") + "/index.tsx",
                ]

                # Check if it's a known template file or a generated file
                is_known = from_path in KNOWN_TEMPLATE_FILES
                is_generated = any(p in all_generated_files for p in possible_paths)

                if not is_known and not is_generated:
                    # Check if it looks like an app-types import
                    if "types" in from_path and from_path != "@/types" and from_path != "@/types/index":
                        # This is fine - they're creating their own types file
                        pass
                    elif "components/app" in from_path:
                        # Check if the component is being generated
                        if not is_generated:
                            errors.append(ValidationError(
                                file_path=file_path,
                                line_number=i,
                                error_type="MISSING_GENERATED_FILE",
                                message=f"Import from '{from_path}' but this file is not being generated",
                                suggestion="Make sure to generate this file, or move the code inline"
                            ))

        # Check for apiClient method calls that don't exist
        api_call_match = re.search(r'apiClient\.(\w+)\(', line)
        if api_call_match:
            method = api_call_match.group(1)
            known_methods = {"getUser", "createUser", "getSubscriptionStatus", "createCheckoutSession"}
            if method not in known_methods:
                errors.append(ValidationError(
                    file_path=file_path,
                    line_number=i,
                    error_type="UNKNOWN_API_METHOD",
                    message=f"apiClient.{method}() doesn't exist",
                    suggestion=f"Available methods: {', '.join(known_methods)}. For custom APIs, use fetch() or mock data"
                ))

        # Check for fetch() calls in preview (warning, not error)
        if "fetch(" in line and "await" in line:
            # This is a warning - might fail in preview but could be intentional
            pass

    # Check for balanced braces (basic syntax check)
    open_braces = content.count("{")
    close_braces = content.count("}")
    if open_braces != close_braces:
        errors.append(ValidationError(
            file_path=file_path,
            line_number=None,
            error_type="SYNTAX_ERROR",
            message=f"Unbalanced braces: {open_braces} '{{' vs {close_braces} '}}'",
            suggestion="Check for missing or extra braces in the file"
        ))

    # Check for "use client" if hooks are used
    hooks_pattern = r'\b(useState|useEffect|useRef|useCallback|useMemo|useContext|useReducer)\b'
    if re.search(hooks_pattern, content):
        if not (content.strip().startswith('"use client"') or content.strip().startswith("'use client'")):
            errors.append(ValidationError(
                file_path=file_path,
                line_number=1,
                error_type="MISSING_USE_CLIENT",
                message="File uses React hooks but missing 'use client' directive",
                suggestion="Add \"use client\"; as the first line of the file"
            ))

    return errors


def validate_generated_files(files: list[dict]) -> ValidationResult:
    """
    Validate all generated files before triggering CodeBuild.

    Args:
        files: List of file dicts with 'path' and 'content' keys

    Returns:
        ValidationResult with any errors found
    """
    result = ValidationResult(valid=True)

    # Build set of all generated file paths
    all_generated = {f.get("path", "") for f in files}

    for file_dict in files:
        path = file_dict.get("path", "")
        content = file_dict.get("content", "")

        if not path or not content:
            continue

        file_errors = validate_file(path, content, all_generated)
        for error in file_errors:
            result.add_error(
                file_path=error.file_path,
                line_number=error.line_number,
                error_type=error.error_type,
                message=error.message,
                suggestion=error.suggestion
            )

    return result


def get_validation_context() -> str:
    """
    Get context about what's available in the template for the AI.
    This can be passed to the AI so it knows what it can import.
    """
    return f"""
## Available in Template

### UI Components (@/components/ui/*)
{', '.join(sorted(KNOWN_UI_COMPONENTS))}

### From @/lib/api
- apiClient.getUser(userId)
- apiClient.createUser(userData)
- apiClient.getSubscriptionStatus(userId)
- apiClient.createCheckoutSession(priceId, userId?)

### From @/lib/utils
- cn(...classes) - className merger

### From @/types
- User, Subscription, PricingPlan, APIResponse, SubscriptionStatus

### Icons (lucide-react)
{', '.join(sorted(list(KNOWN_LUCIDE_ICONS)[:30]))}... and more
"""
