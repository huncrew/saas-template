from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


BuildType = Literal["preview", "deploy"]
BuildStatus = Literal["queued", "running", "failed", "succeeded"]


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    template_id: str = Field(default="saas-crud")


class Project(BaseModel):
    project_id: str
    name: str
    template_id: str
    created_at: str
    last_build_id: Optional[str] = None
    status: Optional[str] = "active"


class BuildArtifacts(BaseModel):
    repo_ref: Optional[str] = None
    preview_url: Optional[str] = None
    deploy_urls: Optional[list[str]] = None
    logs_url: Optional[str] = None
    tf_plan_url: Optional[str] = None
    checks_report_url: Optional[str] = None
    architecture_url: Optional[str] = None
    changes_url: Optional[str] = None
    provider_build_id: Optional[str] = None


class Build(BaseModel):
    build_id: str
    project_id: str
    type: BuildType
    status: BuildStatus
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    artifacts: Optional[BuildArtifacts] = None
    error: Optional[str] = None


ChatRole = Literal["user", "assistant"]
ChatSuggestedAction = Literal["ask_followups", "build_preview", "noop"]


class ChatMessage(BaseModel):
    role: ChatRole
    content: str


class ProjectChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=10_000)
    # If true, the UI intends to auto-trigger preview once the assistant says it's ready.
    auto_preview: bool = False


class ProjectChatResponse(BaseModel):
    # Minimal Lovable-style response shape: assistant + optional followups and suggested next action.
    assistant: ChatMessage
    followups: list[str] = Field(default_factory=list)
    suggested_action: ChatSuggestedAction = "noop"
    plan: Optional[str] = None



