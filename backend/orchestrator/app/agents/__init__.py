"""
Oasify Agent Framework

A lightweight, extensible agent framework for autonomous code generation.
Designed to support:
- Multi-agent collaboration (planner, coder, reviewer)
- Autonomous retry loops with validation
- State persistence across turns
- Easy extension to LangGraph if needed later
"""

from .base import Agent, AgentState, AgentResult
from .chat_agent import ChatAgent
from .spec_agent import SpecGeneratorAgent
from .code_agent import CodeGeneratorAgent
from .validator_agent import ValidatorAgent
from .orchestrator import AgentOrchestrator, ProjectPhase

__all__ = [
    "Agent",
    "AgentState",
    "AgentResult",
    "ChatAgent",
    "SpecGeneratorAgent",
    "CodeGeneratorAgent",
    "ValidatorAgent",
    "AgentOrchestrator",
    "ProjectPhase",
]
