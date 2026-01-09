"""
Oasify Agent Framework

A lightweight, extensible agent framework for autonomous code generation.
Designed to support:
- Multi-agent collaboration (planner, coder, reviewer, security)
- Autonomous retry loops with validation and self-healing
- Security scanning for generated code
- Self-improving autonomous learning from build results
- Real-time progress streaming via SSE
- State persistence across turns
- Easy extension to LangGraph if needed later
"""

from .base import Agent, AgentState, AgentResult
from .chat_agent import ChatAgent
from .spec_agent import SpecGeneratorAgent
from .code_agent import CodeGeneratorAgent
from .validator_agent import ValidatorAgent
from .security_agent import SecurityAgent, run_security_scan
from .autonomous_agent import AutonomousAgent, analyze_and_improve, get_improved_prompt
from .autonomous_controller import (
    AutonomousBuildController,
    BuildPhase,
    BuildProgress,
    run_autonomous_build_with_sse,
    get_global_learning_state,
    update_global_learning_state,
)
from .orchestrator import AgentOrchestrator, ProjectPhase

__all__ = [
    "Agent",
    "AgentState",
    "AgentResult",
    "ChatAgent",
    "SpecGeneratorAgent",
    "CodeGeneratorAgent",
    "ValidatorAgent",
    "SecurityAgent",
    "run_security_scan",
    "AutonomousAgent",
    "analyze_and_improve",
    "get_improved_prompt",
    "AutonomousBuildController",
    "BuildPhase",
    "BuildProgress",
    "run_autonomous_build_with_sse",
    "get_global_learning_state",
    "update_global_learning_state",
    "AgentOrchestrator",
    "ProjectPhase",
]
