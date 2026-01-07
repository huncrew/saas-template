from __future__ import annotations

import os
import threading
import time
from typing import Optional

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import Build, Project, ProjectChatRequest, ProjectChatResponse, ProjectCreate, now_iso
from .repo import get_repo

try:
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None

app = FastAPI(title="Factory Orchestrator", version="0.1")

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in allowed_origins if o.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_user(user_id: Optional[str]) -> str:
    if not user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    return user_id


def _simulate_build(repo, user_id: str, build_id: str) -> None:
    # V1 local behavior: simulate a short running build and fill minimal artifacts
    b = repo.get_build(user_id, build_id)
    if not b:
        return
    b.status = "running"
    b.started_at = now_iso()
    repo.update_build(user_id, b)

    time.sleep(2.5 if b.type == "preview" else 3.5)

    b = repo.get_build(user_id, build_id)
    if not b:
        return
    b.status = "succeeded"
    b.finished_at = now_iso()
    if b.type == "preview":
        # Placeholder URL – in AWS this will be CloudFront /p/{project}/{build}/
        b.artifacts.preview_url = f"http://localhost:3000/p/{b.project_id}/{b.build_id}/"
    repo.update_build(user_id, b)

def _preview_base_url() -> str:
    # e.g. https://d123.cloudfront.net
    return os.getenv("FACTORY_PREVIEW_BASE_URL", "").rstrip("/")


def _start_codebuild(project_name: str, project_id: str, build_id: str) -> None:
    if not boto3:
        raise RuntimeError("boto3 not available")
    client = boto3.client("codebuild")
    resp = client.start_build(
        projectName=project_name,
        environmentVariablesOverride=[
            {"name": "PROJECT_ID", "value": project_id, "type": "PLAINTEXT"},
            {"name": "BUILD_ID", "value": build_id, "type": "PLAINTEXT"},
        ],
    )
    build = resp.get("build") or {}
    return build.get("id") or ""


def _refresh_codebuild_status(build: Build) -> Build:
    if not boto3:
        return build
    provider_id = (build.artifacts.provider_build_id if build.artifacts else None) or ""
    if not provider_id:
        return build
    client = boto3.client("codebuild")
    resp = client.batch_get_builds(ids=[provider_id])
    builds = resp.get("builds") or []
    if not builds:
        return build
    status = (builds[0].get("buildStatus") or "").upper()
    if status in {"IN_PROGRESS"}:
        build.status = "running"
    elif status in {"SUCCEEDED"}:
        build.status = "succeeded"
        build.finished_at = build.finished_at or now_iso()
    elif status in {"FAILED", "FAULT", "STOPPED", "TIMED_OUT"}:
        build.status = "failed"
        build.finished_at = build.finished_at or now_iso()
    return build


@app.get("/v1/projects", response_model=list[Project])
def list_projects(x_user_id: Optional[str] = Header(default=None)) -> list[Project]:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    return repo.list_projects(user_id)


@app.post("/v1/projects", response_model=Project)
def create_project(payload: ProjectCreate, x_user_id: Optional[str] = Header(default=None)) -> Project:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    return repo.create_project(user_id, payload.name, payload.template_id)


@app.get("/v1/projects/{project_id}", response_model=Project)
def get_project(project_id: str, x_user_id: Optional[str] = Header(default=None)) -> Project:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    p = repo.get_project(user_id, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    return p


@app.post("/v1/projects/{project_id}/chat", response_model=ProjectChatResponse)
def project_chat(
    project_id: str,
    payload: ProjectChatRequest,
    x_user_id: Optional[str] = Header(default=None),
) -> ProjectChatResponse:
    """
    V1 "Lovable-style" chat planner endpoint.

    This is intentionally deterministic and lightweight:
    - Extracts a basic plan
    - Asks 1-3 follow-up questions if needed
    - Suggests whether the UI should build a preview next
    """
    user_id = _require_user(x_user_id)
    repo = get_repo()
    p = repo.get_project(user_id, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")

    msg = (payload.message or "").strip()
    lower = msg.lower()

    followups: list[str] = []
    # Minimal guardrails: ask a couple clarifying questions unless user is clearly asking to build.
    wants_build = any(k in lower for k in ["build preview", "preview", "deploy", "ship", "run build"])
    if not wants_build:
        followups = [
            "What’s the primary user and core workflow for this app?",
            "Any required integrations (auth, Stripe, email) for V1?",
            "Should we prioritize speed (minimal) or completeness (more screens, roles, audit log)?",
        ]

    plan = (
        "Plan:\n"
        "- Confirm template scope (V1: saas-crud)\n"
        "- Generate/validate a change spec\n"
        "- Run tests + build\n"
        "- Publish a hosted preview URL\n"
    )

    suggested_action = "build_preview" if wants_build or payload.auto_preview else "ask_followups"

    assistant_text = (
        f"Got it. Project: {p.name} ({p.template_id}).\n\n"
        + (plan if suggested_action == "build_preview" else "Before we build, a couple quick questions:")
    )

    return ProjectChatResponse(
        assistant={"role": "assistant", "content": assistant_text},
        followups=followups,
        suggested_action=suggested_action,  # type: ignore[arg-type]
        plan=plan if suggested_action == "build_preview" else None,
    )


@app.post("/v1/projects/{project_id}/build-preview", response_model=Build)
def build_preview(
    project_id: str,
    background: BackgroundTasks,
    x_user_id: Optional[str] = Header(default=None),
) -> Build:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    project, b = repo.create_build(user_id, project_id, "preview")
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    project.last_build_id = b.build_id
    repo.put_project(user_id, project)

    cb_project = os.getenv("CODEBUILD_PREVIEW_PROJECT", "").strip()
    preview_base = _preview_base_url()
    if preview_base:
        b.artifacts.preview_url = f"{preview_base}/p/{b.project_id}/{b.build_id}/index.html"
        repo.update_build(user_id, b)

    if cb_project:
        # In AWS, CodeBuild will publish the preview to S3/CloudFront.
        try:
            provider_build_id = _start_codebuild(cb_project, b.project_id, b.build_id)
            b.status = "running"
            b.started_at = now_iso()
            if b.artifacts:
                b.artifacts.provider_build_id = provider_build_id
            repo.update_build(user_id, b)
        except Exception as exc:  # pylint: disable=broad-except
            b.status = "failed"
            b.error = str(exc)
            b.finished_at = now_iso()
            repo.update_build(user_id, b)
    else:
        # Local dev fallback
        background.add_task(_simulate_build, repo, user_id, b.build_id)
    return b


@app.post("/v1/projects/{project_id}/deploy", response_model=Build)
def deploy(
    project_id: str,
    background: BackgroundTasks,
    x_user_id: Optional[str] = Header(default=None),
) -> Build:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    project, b = repo.create_build(user_id, project_id, "deploy")
    if not project:
        raise HTTPException(status_code=404, detail="Not found")
    project.last_build_id = b.build_id
    repo.put_project(user_id, project)

    cb_project = os.getenv("CODEBUILD_DEPLOY_PROJECT", "").strip()
    if cb_project:
        try:
            provider_build_id = _start_codebuild(cb_project, b.project_id, b.build_id)
            b.status = "running"
            b.started_at = now_iso()
            if b.artifacts:
                b.artifacts.provider_build_id = provider_build_id
            repo.update_build(user_id, b)
        except Exception as exc:  # pylint: disable=broad-except
            b.status = "failed"
            b.error = str(exc)
            b.finished_at = now_iso()
            repo.update_build(user_id, b)
    else:
        background.add_task(_simulate_build, repo, user_id, b.build_id)
    return b


@app.get("/v1/builds/{build_id}", response_model=Build)
def get_build(build_id: str, x_user_id: Optional[str] = Header(default=None)) -> Build:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    b = repo.get_build(user_id, build_id)
    if not b:
        raise HTTPException(status_code=404, detail="Not found")
    # If CodeBuild is backing this build, poll status on read so UI sees live state.
    if b.status in {"queued", "running"} and b.artifacts and b.artifacts.provider_build_id:
        b = _refresh_codebuild_status(b)
        repo.update_build(user_id, b)
    return b


@app.get("/health")
def health() -> dict:
    return {"ok": True}


