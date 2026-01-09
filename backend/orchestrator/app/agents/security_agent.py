"""
SecurityAgent - Validates generated code for security issues.

This agent:
- Scans for hardcoded secrets and API keys
- Checks for common vulnerabilities (XSS, injection, etc.)
- Validates input sanitization patterns
- Reports security findings with severity levels
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .base import Agent, AgentState, AgentResult, AIClient


@dataclass
class SecurityFinding:
    """A security issue found in the code."""
    severity: str  # "critical", "high", "medium", "low", "info"
    category: str  # "secrets", "xss", "injection", "auth", "config", etc.
    file_path: str
    line_number: Optional[int]
    description: str
    recommendation: str


@dataclass
class SecurityState(AgentState):
    """State for security scanning."""
    files_to_scan: list[dict] = field(default_factory=list)  # [{path, content}]
    findings: list[SecurityFinding] = field(default_factory=list)
    scan_complete: bool = False


@dataclass
class SecurityResult:
    """Result from security scan."""
    findings: list[SecurityFinding]
    passed: bool
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    summary: str


# Patterns for detecting secrets
SECRET_PATTERNS = [
    # API Keys and tokens
    (r'(?i)(api[_-]?key|apikey)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?', 'API key detected'),
    (r'(?i)(secret[_-]?key|secretkey)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?', 'Secret key detected'),
    (r'(?i)(access[_-]?token|accesstoken)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?', 'Access token detected'),
    (r'(?i)(auth[_-]?token|authtoken)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?', 'Auth token detected'),

    # AWS
    (r'AKIA[0-9A-Z]{16}', 'AWS Access Key ID detected'),
    (r'(?i)aws[_-]?secret[_-]?access[_-]?key\s*[:=]\s*["\']?[a-zA-Z0-9/+=]{40}["\']?', 'AWS Secret Access Key detected'),

    # Database
    (r'(?i)(password|passwd|pwd)\s*[:=]\s*["\'][^"\']{8,}["\']', 'Hardcoded password detected'),
    (r'(?i)mongodb(\+srv)?://[^:]+:[^@]+@', 'MongoDB connection string with credentials'),
    (r'(?i)postgres(ql)?://[^:]+:[^@]+@', 'PostgreSQL connection string with credentials'),
    (r'(?i)mysql://[^:]+:[^@]+@', 'MySQL connection string with credentials'),

    # Private keys
    (r'-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----', 'Private key detected'),
    (r'-----BEGIN PGP PRIVATE KEY BLOCK-----', 'PGP private key detected'),

    # JWT
    (r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+', 'JWT token detected'),

    # Generic secrets
    (r'(?i)(client[_-]?secret)\s*[:=]\s*["\']?[a-zA-Z0-9_\-]{20,}["\']?', 'Client secret detected'),
    (r'(?i)bearer\s+[a-zA-Z0-9_\-\.]+', 'Bearer token detected'),
]

# Patterns for XSS vulnerabilities
XSS_PATTERNS = [
    (r'dangerouslySetInnerHTML\s*=\s*\{', 'React dangerouslySetInnerHTML usage - potential XSS'),
    (r'innerHTML\s*=', 'Direct innerHTML assignment - potential XSS'),
    (r'document\.write\s*\(', 'document.write usage - potential XSS'),
    (r'eval\s*\(', 'eval() usage - potential code injection'),
    (r'v-html\s*=', 'Vue v-html directive - potential XSS'),
]

# Patterns for injection vulnerabilities
INJECTION_PATTERNS = [
    (r'\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP)', 'Potential SQL injection in template literal'),
    (r'f["\'].*(?:SELECT|INSERT|UPDATE|DELETE|DROP).*\{', 'Potential SQL injection in f-string'),
    (r'exec\s*\(', 'exec() usage - potential code injection'),
    (r'subprocess\.call\s*\([^)]*shell\s*=\s*True', 'Shell injection risk with shell=True'),
    (r'os\.system\s*\(', 'os.system usage - potential command injection'),
]

# Patterns for auth/session issues
AUTH_PATTERNS = [
    (r'(?i)httponly\s*[:=]\s*false', 'Cookie without HttpOnly flag'),
    (r'(?i)secure\s*[:=]\s*false', 'Cookie without Secure flag'),
    (r'(?i)sameSite\s*[:=]\s*["\']?none["\']?', 'SameSite=None cookie configuration'),
    (r'(?i)verify\s*[:=]\s*false', 'SSL/TLS verification disabled'),
    (r'(?i)rejectUnauthorized\s*[:=]\s*false', 'TLS certificate verification disabled'),
]

# Patterns for configuration issues
CONFIG_PATTERNS = [
    (r'(?i)debug\s*[:=]\s*true', 'Debug mode enabled'),
    (r'(?i)allow[_-]?all[_-]?origins', 'CORS allowing all origins'),
    (r'\*\s*:\s*\*|["\']?\*["\']?\s*,?\s*$', 'Wildcard permissions detected'),
    (r'0\.0\.0\.0', 'Binding to all interfaces'),
]


class SecurityAgent(Agent[SecurityState, SecurityResult]):
    """
    Agent that scans generated code for security vulnerabilities.
    """

    name = "security_agent"
    description = "Scans code for security vulnerabilities and secrets"

    def create_initial_state(
        self,
        files: Optional[list[dict]] = None,
        **kwargs
    ) -> SecurityState:
        return SecurityState(
            files_to_scan=files or [],
            max_iterations=1,
        )

    def _scan_for_patterns(
        self,
        content: str,
        file_path: str,
        patterns: list[tuple],
        category: str,
        severity: str,
        recommendation: str
    ) -> list[SecurityFinding]:
        """Scan content for regex patterns and return findings."""
        findings = []
        lines = content.split('\n')

        for pattern, description in patterns:
            for line_num, line in enumerate(lines, 1):
                if re.search(pattern, line):
                    findings.append(SecurityFinding(
                        severity=severity,
                        category=category,
                        file_path=file_path,
                        line_number=line_num,
                        description=description,
                        recommendation=recommendation,
                    ))

        return findings

    def _scan_file(self, file_path: str, content: str) -> list[SecurityFinding]:
        """Scan a single file for security issues."""
        findings = []

        # Skip scanning certain files
        skip_patterns = ['.md', '.txt', '.json', '.yaml', '.yml', '.lock', '.svg', '.png', '.jpg']
        if any(file_path.endswith(ext) for ext in skip_patterns):
            return findings

        # Secrets (critical)
        findings.extend(self._scan_for_patterns(
            content, file_path,
            SECRET_PATTERNS,
            category="secrets",
            severity="critical",
            recommendation="Remove hardcoded secrets and use environment variables or a secrets manager"
        ))

        # XSS (high)
        findings.extend(self._scan_for_patterns(
            content, file_path,
            XSS_PATTERNS,
            category="xss",
            severity="high",
            recommendation="Sanitize user input before rendering. Use safe APIs that auto-escape content"
        ))

        # Injection (high)
        findings.extend(self._scan_for_patterns(
            content, file_path,
            INJECTION_PATTERNS,
            category="injection",
            severity="high",
            recommendation="Use parameterized queries and avoid string concatenation for commands"
        ))

        # Auth issues (medium)
        findings.extend(self._scan_for_patterns(
            content, file_path,
            AUTH_PATTERNS,
            category="auth",
            severity="medium",
            recommendation="Enable security flags for cookies and verify TLS certificates"
        ))

        # Config issues (low)
        findings.extend(self._scan_for_patterns(
            content, file_path,
            CONFIG_PATTERNS,
            category="config",
            severity="low",
            recommendation="Review configuration for production readiness"
        ))

        return findings

    def _deduplicate_findings(self, findings: list[SecurityFinding]) -> list[SecurityFinding]:
        """Remove duplicate findings (same file, line, category)."""
        seen = set()
        unique = []
        for f in findings:
            key = (f.file_path, f.line_number, f.category, f.description)
            if key not in seen:
                seen.add(key)
                unique.append(f)
        return unique

    async def run(
        self,
        state: SecurityState,
        user_id: str = "",
        **kwargs
    ) -> AgentResult[SecurityResult]:
        """
        Scan all files for security issues.
        """
        all_findings = []

        for file_info in state.files_to_scan:
            path = file_info.get("path", "")
            content = file_info.get("content", "")
            if path and content:
                file_findings = self._scan_file(path, content)
                all_findings.extend(file_findings)

        # Deduplicate
        all_findings = self._deduplicate_findings(all_findings)

        # Count by severity
        critical_count = sum(1 for f in all_findings if f.severity == "critical")
        high_count = sum(1 for f in all_findings if f.severity == "high")
        medium_count = sum(1 for f in all_findings if f.severity == "medium")
        low_count = sum(1 for f in all_findings if f.severity == "low")

        # Determine if passed (no critical or high issues)
        passed = critical_count == 0 and high_count == 0

        # Generate summary
        if not all_findings:
            summary = "No security issues detected. Code passed all security checks."
        elif passed:
            summary = f"Code passed security checks with {medium_count + low_count} minor findings."
        else:
            summary = f"Security scan failed: {critical_count} critical, {high_count} high severity issues found."

        state.findings = all_findings
        state.scan_complete = True
        state.update()

        result = SecurityResult(
            findings=all_findings,
            passed=passed,
            critical_count=critical_count,
            high_count=high_count,
            medium_count=medium_count,
            low_count=low_count,
            summary=summary,
        )

        return AgentResult(
            success=True,
            data=result,
            should_continue=False,
        )


def run_security_scan(files: list[dict]) -> dict:
    """
    Convenience function to run security scan on a list of files.

    Args:
        files: List of dicts with 'path' and 'content' keys

    Returns:
        Dict with scan results
    """
    from .integration import run_async

    agent = SecurityAgent()
    state = agent.create_initial_state(files=files)
    result = run_async(agent.run(state))

    if result.success and result.data:
        return {
            "success": True,
            "passed": result.data.passed,
            "summary": result.data.summary,
            "critical_count": result.data.critical_count,
            "high_count": result.data.high_count,
            "medium_count": result.data.medium_count,
            "low_count": result.data.low_count,
            "findings": [
                {
                    "severity": f.severity,
                    "category": f.category,
                    "file_path": f.file_path,
                    "line_number": f.line_number,
                    "description": f.description,
                    "recommendation": f.recommendation,
                }
                for f in result.data.findings
            ],
        }
    else:
        return {
            "success": False,
            "passed": False,
            "summary": result.error or "Security scan failed",
            "findings": [],
        }
