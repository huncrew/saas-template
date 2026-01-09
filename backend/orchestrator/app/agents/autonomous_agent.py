"""
AutonomousAgent - Self-improving agent that learns from build results.

This agent:
- Analyzes build successes and failures
- Extracts patterns from validation/security findings
- Generates improvements to prompts and templates
- Tracks metrics for continuous improvement
- Can trigger rebuild attempts with refined strategies
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from .base import Agent, AgentState, AgentResult, AIClient


class ImprovementType(Enum):
    """Types of improvements the autonomous agent can suggest."""
    PROMPT_REFINEMENT = "prompt_refinement"
    PATTERN_ADDITION = "pattern_addition"
    VALIDATION_RULE = "validation_rule"
    SECURITY_PATTERN = "security_pattern"
    TEMPLATE_UPDATE = "template_update"


@dataclass
class BuildAnalysis:
    """Analysis of a build result."""
    build_id: str
    project_id: str
    success: bool
    validation_passed: bool
    security_passed: bool

    # Extracted patterns
    error_patterns: list[str] = field(default_factory=list)
    security_findings_by_category: dict[str, int] = field(default_factory=dict)
    files_with_issues: list[str] = field(default_factory=list)

    # Generated improvements
    suggested_improvements: list[dict] = field(default_factory=list)

    analyzed_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class LearningState(AgentState):
    """State for the autonomous learning process."""
    build_history: list[BuildAnalysis] = field(default_factory=list)
    error_patterns_seen: dict[str, int] = field(default_factory=dict)  # pattern -> count
    successful_patterns: list[str] = field(default_factory=list)  # patterns that work well
    improvement_suggestions: list[dict] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)


@dataclass
class AutonomousResult:
    """Result from autonomous analysis."""
    analysis: BuildAnalysis
    improvements: list[dict]
    should_retry: bool
    retry_strategy: Optional[str] = None
    metrics_update: dict = field(default_factory=dict)


# Common error patterns to detect and learn from
ERROR_PATTERNS = [
    # TypeScript/JavaScript
    (r"Cannot find module", "missing_import", "Add missing import statement"),
    (r"Property .+ does not exist on type", "type_error", "Fix type annotation"),
    (r"Type .+ is not assignable to type", "type_mismatch", "Ensure proper typing"),
    (r"Argument of type .+ is not assignable", "arg_type_error", "Fix function argument types"),
    (r"Expected .+ arguments?, but got", "arg_count_error", "Match function signature"),

    # Python
    (r"NameError: name .+ is not defined", "undefined_name", "Import or define the name"),
    (r"AttributeError:", "attribute_error", "Check object attributes"),
    (r"ImportError:", "import_error", "Fix import statement"),
    (r"SyntaxError:", "syntax_error", "Fix code syntax"),

    # General
    (r"Cannot read propert", "null_access", "Add null check"),
    (r"undefined is not", "undefined_error", "Initialize variable"),
    (r"Unexpected token", "parse_error", "Fix syntax"),
]

# Success patterns to reinforce
SUCCESS_PATTERNS = [
    "use client directive at top",
    "proper import paths",
    "type annotations included",
    "error handling present",
    "null checks included",
]


class AutonomousAgent(Agent[LearningState, AutonomousResult]):
    """
    Agent that analyzes build results and learns to improve.
    """

    name = "autonomous_agent"
    description = "Learns from builds to improve code generation"

    def create_initial_state(
        self,
        max_iterations: int = 5,
        **kwargs
    ) -> LearningState:
        return LearningState(
            max_iterations=max_iterations,
            metrics={
                "total_builds_analyzed": 0,
                "success_rate": 0.0,
                "common_errors": {},
                "improvements_suggested": 0,
            }
        )

    def analyze_build_result(
        self,
        build_id: str,
        project_id: str,
        success: bool,
        validation_passed: bool,
        security_passed: bool,
        validation_errors: list[dict] = None,
        security_findings: list[dict] = None,
        file_changes: list[dict] = None,
    ) -> BuildAnalysis:
        """Analyze a single build result."""
        analysis = BuildAnalysis(
            build_id=build_id,
            project_id=project_id,
            success=success,
            validation_passed=validation_passed,
            security_passed=security_passed,
        )

        # Analyze validation errors
        if validation_errors:
            for error in validation_errors:
                message = error.get("message", "")
                for pattern, error_type, suggestion in ERROR_PATTERNS:
                    import re
                    if re.search(pattern, message, re.IGNORECASE):
                        analysis.error_patterns.append(error_type)
                        analysis.suggested_improvements.append({
                            "type": ImprovementType.VALIDATION_RULE.value,
                            "pattern": error_type,
                            "suggestion": suggestion,
                            "source_error": message[:200],
                        })
                        break

                if error.get("file"):
                    analysis.files_with_issues.append(error["file"])

        # Analyze security findings
        if security_findings:
            for finding in security_findings:
                category = finding.get("category", "unknown")
                analysis.security_findings_by_category[category] = \
                    analysis.security_findings_by_category.get(category, 0) + 1

                if finding.get("severity") in ("critical", "high"):
                    analysis.suggested_improvements.append({
                        "type": ImprovementType.SECURITY_PATTERN.value,
                        "category": category,
                        "suggestion": finding.get("recommendation", "Fix security issue"),
                        "file_path": finding.get("file_path"),
                    })

                if finding.get("file_path"):
                    analysis.files_with_issues.append(finding["file_path"])

        # Generate prompt improvements based on errors
        if analysis.error_patterns:
            most_common = max(set(analysis.error_patterns), key=analysis.error_patterns.count)
            analysis.suggested_improvements.append({
                "type": ImprovementType.PROMPT_REFINEMENT.value,
                "focus": most_common,
                "suggestion": f"Add instruction to avoid {most_common} errors",
            })

        return analysis

    def should_retry_build(
        self,
        analysis: BuildAnalysis,
        attempt_count: int,
        max_attempts: int = 3,
    ) -> tuple[bool, Optional[str]]:
        """Determine if we should retry the build with improvements."""
        if attempt_count >= max_attempts:
            return False, None

        if analysis.success:
            return False, None

        # Check if errors are recoverable
        recoverable_patterns = {"type_error", "missing_import", "type_mismatch"}
        error_set = set(analysis.error_patterns)

        if error_set & recoverable_patterns:
            strategy = "Add explicit type imports and annotations"
            return True, strategy

        if "syntax_error" in error_set or "parse_error" in error_set:
            strategy = "Generate cleaner code with simpler syntax"
            return True, strategy

        if analysis.security_findings_by_category.get("secrets", 0) > 0:
            strategy = "Replace hardcoded values with environment variables"
            return True, strategy

        return False, None

    def update_learning(
        self,
        state: LearningState,
        analysis: BuildAnalysis,
    ) -> None:
        """Update the learning state with new analysis."""
        state.build_history.append(analysis)

        # Track error patterns
        for pattern in analysis.error_patterns:
            state.error_patterns_seen[pattern] = \
                state.error_patterns_seen.get(pattern, 0) + 1

        # Track successful patterns
        if analysis.success:
            for pattern in SUCCESS_PATTERNS:
                if pattern not in state.successful_patterns:
                    state.successful_patterns.append(pattern)

        # Add new improvement suggestions
        for improvement in analysis.suggested_improvements:
            if improvement not in state.improvement_suggestions:
                state.improvement_suggestions.append(improvement)

        # Update metrics
        total_builds = len(state.build_history)
        successful_builds = sum(1 for b in state.build_history if b.success)

        state.metrics.update({
            "total_builds_analyzed": total_builds,
            "success_rate": successful_builds / total_builds if total_builds > 0 else 0.0,
            "common_errors": dict(sorted(
                state.error_patterns_seen.items(),
                key=lambda x: x[1],
                reverse=True
            )[:10]),
            "improvements_suggested": len(state.improvement_suggestions),
        })

    def generate_improved_prompt(
        self,
        state: LearningState,
        base_prompt: str,
    ) -> str:
        """Generate an improved prompt based on learning."""
        improvements = []

        # Add instructions based on common errors
        if state.error_patterns_seen:
            top_errors = sorted(
                state.error_patterns_seen.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]

            for error_type, count in top_errors:
                if error_type == "type_error":
                    improvements.append("- Always include proper TypeScript type annotations")
                elif error_type == "missing_import":
                    improvements.append("- Ensure all imports are included at the top of files")
                elif error_type == "null_access":
                    improvements.append("- Add null/undefined checks before accessing properties")
                elif error_type == "type_mismatch":
                    improvements.append("- Match exact types required by function signatures")

        # Add security-related instructions
        security_issues = {}
        for analysis in state.build_history:
            for cat, count in analysis.security_findings_by_category.items():
                security_issues[cat] = security_issues.get(cat, 0) + count

        if security_issues.get("secrets", 0) > 0:
            improvements.append("- Never hardcode secrets; use environment variables")
        if security_issues.get("xss", 0) > 0:
            improvements.append("- Sanitize user input before rendering")
        if security_issues.get("injection", 0) > 0:
            improvements.append("- Use parameterized queries; avoid string concatenation")

        if improvements:
            improvement_block = "\n\nIMPORTANT - Avoid common issues:\n" + "\n".join(improvements)
            return base_prompt + improvement_block

        return base_prompt

    async def run(
        self,
        state: LearningState,
        build_result: dict = None,
        user_id: str = "",
        **kwargs
    ) -> AgentResult[AutonomousResult]:
        """
        Analyze a build result and generate improvements.
        """
        if not build_result:
            return AgentResult(
                success=False,
                error="No build result provided",
                should_continue=False,
            )

        # Analyze the build
        analysis = self.analyze_build_result(
            build_id=build_result.get("build_id", "unknown"),
            project_id=build_result.get("project_id", "unknown"),
            success=build_result.get("success", False),
            validation_passed=build_result.get("validation_passed", False),
            security_passed=build_result.get("security_passed", True),
            validation_errors=build_result.get("validation_errors", []),
            security_findings=build_result.get("security_findings", []),
            file_changes=build_result.get("file_changes", []),
        )

        # Update learning state
        self.update_learning(state, analysis)

        # Check if we should retry
        attempt_count = build_result.get("attempt_count", 1)
        should_retry, retry_strategy = self.should_retry_build(analysis, attempt_count)

        result = AutonomousResult(
            analysis=analysis,
            improvements=analysis.suggested_improvements,
            should_retry=should_retry,
            retry_strategy=retry_strategy,
            metrics_update=state.metrics,
        )

        return AgentResult(
            success=True,
            data=result,
            should_continue=should_retry,
        )


def analyze_and_improve(
    build_result: dict,
    learning_state: dict = None,
) -> dict:
    """
    Convenience function to analyze a build and suggest improvements.

    Args:
        build_result: Dict with build results (success, validation_errors, etc.)
        learning_state: Optional previous learning state to continue from

    Returns:
        Dict with analysis, improvements, and updated learning state
    """
    from .integration import run_async

    agent = AutonomousAgent()

    if learning_state:
        state = LearningState(
            max_iterations=5,
            build_history=[],
            error_patterns_seen=learning_state.get("error_patterns_seen", {}),
            successful_patterns=learning_state.get("successful_patterns", []),
            improvement_suggestions=learning_state.get("improvement_suggestions", []),
            metrics=learning_state.get("metrics", {}),
        )
    else:
        state = agent.create_initial_state()

    result = run_async(agent.run(state, build_result=build_result))

    if result.success and result.data:
        return {
            "success": True,
            "analysis": {
                "build_id": result.data.analysis.build_id,
                "success": result.data.analysis.success,
                "error_patterns": result.data.analysis.error_patterns,
                "security_findings_by_category": result.data.analysis.security_findings_by_category,
                "files_with_issues": list(set(result.data.analysis.files_with_issues)),
            },
            "improvements": result.data.improvements,
            "should_retry": result.data.should_retry,
            "retry_strategy": result.data.retry_strategy,
            "metrics": result.data.metrics_update,
            "learning_state": {
                "error_patterns_seen": state.error_patterns_seen,
                "successful_patterns": state.successful_patterns,
                "improvement_suggestions": state.improvement_suggestions,
                "metrics": state.metrics,
            },
        }
    else:
        return {
            "success": False,
            "error": result.error or "Analysis failed",
        }


def get_improved_prompt(learning_state: dict, base_prompt: str) -> str:
    """
    Get an improved prompt based on learning history.

    Args:
        learning_state: Previous learning state
        base_prompt: The base prompt to improve

    Returns:
        Improved prompt with additional instructions
    """
    agent = AutonomousAgent()
    state = LearningState(
        max_iterations=1,
        error_patterns_seen=learning_state.get("error_patterns_seen", {}),
        successful_patterns=learning_state.get("successful_patterns", []),
        improvement_suggestions=learning_state.get("improvement_suggestions", []),
        metrics=learning_state.get("metrics", {}),
    )

    return agent.generate_improved_prompt(state, base_prompt)
