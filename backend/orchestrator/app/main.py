from __future__ import annotations

import asyncio
import os
import json
import threading
import time
from pathlib import Path
from typing import Optional
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from io import BytesIO
import zipfile

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import yaml

from .models import (
    Build,
    ChatMessage,
    Project,
    ProjectChatRequest,
    ProjectChatResponse,
    ProjectCreate,
    now_iso,
)
from .repo import get_repo

# Agent framework imports
from .agents.integration import (
    process_chat_with_agents,
    generate_code_with_agents,
    run_async,
)

try:
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None

app = FastAPI(title="Factory Orchestrator", version="0.2")


def _use_agents() -> bool:
    """Check if agent-based chat is enabled."""
    return os.getenv("USE_AGENT_CHAT", "1").lower() in ("1", "true", "yes")

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

def _backend_api_url() -> str:
    return (os.getenv("BACKEND_API_URL") or "").rstrip("/")


def _factory_template_key() -> str:
    return (os.getenv("FACTORY_TEMPLATE_KEY") or "").strip()

def _artifacts_bucket() -> str:
    return (os.getenv("FACTORY_ARTIFACTS_BUCKET") or "").strip()


def _load_template_config(template_id: str) -> Optional[dict]:
    if not template_id:
        return None
    if template_id in _TEMPLATE_CACHE:
        return _TEMPLATE_CACHE[template_id]
    path = TEMPLATES_DIR / template_id / "template.yaml"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
            _TEMPLATE_CACHE[template_id] = data
            return data
    except Exception:
        return None


def _load_module_config(module_id: str) -> Optional[dict]:
    if not module_id:
        return None
    if module_id in _MODULE_CACHE:
        return _MODULE_CACHE[module_id]
    path = MODULES_DIR / module_id / "module.yaml"
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
            _MODULE_CACHE[module_id] = data
            return data
    except Exception:
        return None


def _modules_prompt_hint() -> str:
    """
    Provide the model with a list of available modules (metadata only).
    """
    if not MODULES_DIR.exists():
        return "Modules: (none found)\n"
    modules: list[dict] = []
    for child in sorted(MODULES_DIR.iterdir()):
        if not child.is_dir():
            continue
        mid = child.name
        cfg = _load_module_config(mid) or {}
        meta = cfg.get("module") or {}
        modules.append(
            {
                "id": meta.get("id") or mid,
                "name": meta.get("name") or mid,
                "description": meta.get("description") or "",
                "inputs": cfg.get("inputs") or [],
                "outputs": cfg.get("outputs") or [],
            }
        )
    return "Available modules:\n" + yaml.safe_dump(modules, sort_keys=False, allow_unicode=True)


def _available_module_ids() -> list[str]:
    if not MODULES_DIR.exists():
        return []
    ids: list[str] = []
    for child in sorted(MODULES_DIR.iterdir()):
        if child.is_dir():
            ids.append(child.name)
    return ids


def _detect_modules_from_text(text: str) -> list[str]:
    t = (text or "").lower()
    hits: list[str] = []
    for mid in _available_module_ids():
        if mid.lower() in t:
            hits.append(mid)
    return hits


def _template_prompt_hint(template_id: str) -> str:
    cfg = _load_template_config(template_id) or {}
    template_meta = cfg.get("template") or {}
    spec_schema = cfg.get("spec_schema") or {}
    guidance = cfg.get("guidance") or {}
    schema_dump = ""
    if spec_schema:
        schema_dump = yaml.safe_dump(spec_schema, sort_keys=False, allow_unicode=True)
    guidance_dump = ""
    if guidance:
        guidance_dump = yaml.safe_dump(guidance, sort_keys=False, allow_unicode=True)
    return (
        "Template metadata:\n"
        + yaml.safe_dump(template_meta, sort_keys=False, allow_unicode=True)
        + "\nSpec schema:\n"
        + (schema_dump or "N/A\n")
        + "\nGuidance:\n"
        + (guidance_dump or "N/A\n")
        + "\n"
        + _modules_prompt_hint()
    )


def _s3_put_text(bucket: str, key: str, text: str, content_type: str) -> None:
    if not boto3:
        raise RuntimeError("boto3 not available")
    s3 = boto3.client("s3")
    s3.put_object(Bucket=bucket, Key=key, Body=text.encode("utf-8"), ContentType=content_type)


def _selected_module_ids_from_spec(project: Project) -> list[str]:
    """
    Read project.spec_yaml and extract ordered module ids.
    Accepts either:
      modules: ["auth-clerk", "billing-stripe"]
    or:
      modules:
        - id: auth-clerk
          config: {...}
    """
    doc = (project.spec_yaml or "").strip()
    if not doc:
        return []
    try:
        parsed = yaml.safe_load(doc)
    except Exception:
        return []
    if not isinstance(parsed, dict):
        return []
    modules = parsed.get("modules") or []
    out: list[str] = []
    if isinstance(modules, list):
        for entry in modules:
            if isinstance(entry, str):
                out.append(entry)
            elif isinstance(entry, dict) and isinstance(entry.get("id"), str):
                out.append(entry["id"])
    return [m for m in out if m]


def _module_patch_keys_for_build(project: Project, project_id: str, build_id: str, bucket: str) -> list[str]:
    """
    Upload module patch diffs (if any) to the artifacts bucket, returning their S3 keys.
    Module patches are deterministic and live under orchestrator/factory/modules/<id>/patches/*.diff
    """
    keys: list[str] = []
    for mid in _selected_module_ids_from_spec(project):
        cfg = _load_module_config(mid) or {}
        patch_list = cfg.get("patches") or []
        if not isinstance(patch_list, list):
            continue
        module_dir = MODULES_DIR / mid
        for rel in patch_list:
            if not isinstance(rel, str) or not rel:
                continue
            path = (module_dir / rel).resolve()
            if not str(path).startswith(str(module_dir.resolve())):
                continue
            if not path.exists() or not path.is_file():
                continue
            try:
                content = path.read_text(encoding="utf-8")
            except Exception:
                continue
            key = f"projects/{project_id}/builds/{build_id}/modules/{mid}/{path.name}"
            _s3_put_text(bucket, key, content, "text/plain; charset=utf-8")
            keys.append(key)
    return keys
def _template_manifest(bucket: str, key: str) -> list[str]:
    """
    Return a list of file paths inside the template zip stored in S3.
    This is used to ground patch generation so diffs target real paths.
    """
    if not boto3:
        raise RuntimeError("boto3 not available")
    s3 = boto3.client("s3")
    obj = s3.get_object(Bucket=bucket, Key=key)
    data = obj["Body"].read()
    z = zipfile.ZipFile(BytesIO(data))
    names: list[str] = []
    for n in z.namelist():
        if n.endswith("/"):
            continue
        # Strip noisy/large dirs if present
        if "/node_modules/" in n or "/.next/" in n or "/.git/" in n:
            continue
        names.append(n)
    names.sort()
    return names


def _extract_patch(text: str) -> str:
    """
    Extract a git-apply compatible diff from model output.
    Accepts raw diff or ```diff fenced output.
    """
    t = (text or "").strip()
    if not t:
        return ""
    # Strip common fenced formats even if the model forgets the closing fence.
    lines = t.splitlines()
    if lines and lines[0].strip().startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    t = "\n".join(lines).strip()
    if "```diff" in t:
        # Handle embedded fence.
        start = t.find("```diff") + len("```diff")
        end = t.find("```", start)
        t = t[start:end].strip() if end != -1 else t[start:].strip()
    # Guard: require something that looks like a diff.
    if "```" in t:
        return ""
    if "diff --git" in t or t.startswith("--- ") or t.startswith("Index:"):
        return t
    return ""


def _normalize_patch_paths(patch_text: str) -> str:
    """
    Normalize common LLM diff path mistakes so `git apply` is more likely to work.
    Example: some models emit `a/a/<path>` and `b/b/<path>`.
    """
    t = (patch_text or "").strip("\n")
    if not t:
        return ""
    # Collapse duplicate git prefixes.
    for _ in range(2):
        t = t.replace("diff --git a/a/", "diff --git a/")
        t = t.replace("diff --git b/b/", "diff --git b/")
        t = t.replace("--- a/a/", "--- a/")
        t = t.replace("+++ b/b/", "+++ b/")
    return t + "\n"


def _patch_prompt(project: Project) -> str:
    """
    Ask the model to produce a minimal patch against the template.
    This is V1: we generate a patch from the spec without repo introspection.
    """
    template_key = _factory_template_key() or "templates/saas-template-codex-copy.zip"
    template_hint = _template_prompt_hint(project.template_id)
    bucket = _artifacts_bucket()
    manifest: list[str] = []
    if bucket and template_key:
        try:
            manifest = _template_manifest(bucket, template_key)
        except Exception:
            manifest = []
    manifest_hint = ""
    if manifest:
        # Keep prompt size bounded
        head = manifest[:400]
        manifest_hint = (
            "\nTEMPLATE FILE MANIFEST (paths relative to repo root):\n"
            + "\n".join(head)
            + ("\n...(truncated)\n" if len(manifest) > len(head) else "\n")
        )

    spec_yaml = (project.spec_yaml or "").strip()
    spec = spec_yaml if spec_yaml else (project.spec_markdown or "").strip()
    return (
        "You are an expert code generator.\n"
        "Generate a git-apply compatible unified diff patch to implement the spec.\n"
        "Constraints:\n"
        "- Output ONLY the diff (no markdown fences, no commentary).\n"
        "- The repo root is a template zip with frontend/ (Next.js 15 static export) and backend/ (python lambdas).\n"
        "- IMPORTANT: Only modify/add files that exist in the template manifest, or add new files under existing directories.\n"
        "- Use paths like a/frontend/... b/frontend/... (relative to repo root).\n"
        "- Keep changes minimal and focused.\n"
        "- Prefer adding new files over huge edits.\n\n"
        "Implementation guidance:\n"
        "- Frontend should call the API Gateway base URL via NEXT_PUBLIC_API_BASE_URL.\n"
        "- Do NOT add Next.js API routes (frontend/src/app/api/*) or middleware.\n"
        "- If backend changes are required, modify backend/lambdas/api/* handlers and shared code under backend/lambdas/common/.\n"
        "- Include backend + frontend changes when needed to fulfill the spec.\n\n"
        f"Template key: {template_key}\n"
        f"Project name: {project.name}\n"
        f"Template id: {project.template_id}\n\n"
        + "Template context:\n"
        + template_hint
        + "\n"
        + manifest_hint
        + "\n"
        + ("SPEC (YAML):\n" if spec_yaml else "SPEC:\n")
        + spec
        + "\n"
    )


def _ai_generate(user_id: str, prompt: str) -> str:
    """
    Call the existing backend AI gateway (Lambda via API Gateway) which uses Bedrock today.
    This keeps the orchestrator lightweight and avoids embedding model credentials here.
    """
    base = _backend_api_url()
    if not base:
        raise RuntimeError("BACKEND_API_URL not configured")

    payload = {
        "userId": user_id,
        "prompt": prompt,
        # Leave model unspecified so the backend uses its configured default (SSM-driven).
        "temperature": 0.2,
        "maxTokens": 1800,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        f"{base}/ai/generate",
        method="POST",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlrequest.urlopen(req, timeout=45) as resp:
            body = resp.read().decode("utf-8")
    except HTTPError as exc:
        err_body = exc.read().decode("utf-8") if hasattr(exc, "read") else ""
        raise RuntimeError(f"AI generate failed: {exc.code} {err_body}") from exc
    except URLError as exc:
        raise RuntimeError(f"AI generate failed: {exc}") from exc

    parsed = json.loads(body) if body else {}
    if not parsed.get("success"):
        raise RuntimeError(parsed.get("error") or "AI generate failed")
    return (parsed.get("data") or {}).get("response") or ""


def _extract_json(text: str) -> Optional[dict]:
    """
    Try to extract JSON object from a model response.
    Accepts either raw JSON or ```json fenced output.
    """
    t = (text or "").strip()
    if not t:
        return None
    if "```json" in t:
        start = t.find("```json") + len("```json")
        end = t.find("```", start)
        if end != -1:
            t = t[start:end].strip()
    if t.startswith("{") and t.endswith("}"):
        try:
            return json.loads(t)
        except Exception:
            return None
    return None


def _format_history(history: list[ChatMessage]) -> str:
    if not history:
        return ""
    lines: list[str] = []
    # Keep the prompt bounded by only including the last few turns.
    for entry in history[-8:]:
        role = "User" if entry.role == "user" else "Assistant"
        content = (entry.content or "").strip()
        if not content:
            continue
        lines.append(f"{role}: {content}")
    return "\n".join(lines)


def _spec_markdown_from_yaml(spec_yaml: str) -> str:
    doc = (spec_yaml or "").strip()
    if not doc:
        return ""
    try:
        parsed = yaml.safe_load(doc)
    except Exception:
        parsed = None
    if isinstance(parsed, dict):
        lines: list[str] = []
        for key, value in parsed.items():
            title = str(key).replace("_", " ").title()
            lines.append(f"## {title}")
            if isinstance(value, str):
                lines.append(value.strip())
            elif isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        inner = ", ".join(f"{k}: {v}" for k, v in item.items())
                        lines.append(f"- {inner}")
                    else:
                        lines.append(f"- {item}")
            elif isinstance(value, dict):
                for sub_key, sub_val in value.items():
                    lines.append(f"- {sub_key}: {sub_val}")
            else:
                lines.append(f"- {value}")
            lines.append("")
        return "\n".join(lines).strip()
    return f"```yaml\n{doc}\n```"


def _spec_prompt(project: Project, user_message: str, history: Optional[list[ChatMessage]] = None) -> str:
    """
    Build the instruction prompt for the spec generation call.
    Keep it conversational and focused on chat experience.
    """
    template_key = _factory_template_key() or "templates/saas-template-codex-copy.zip"
    
    conversation_hint = ""
    formatted_history = _format_history(history or [])
    if formatted_history:
        conversation_hint = "Previous conversation:\n" + formatted_history + "\n\n"

    template_hint = _template_prompt_hint(project.template_id)

    return (
        "You are a helpful AI assistant helping plan a web app. Be conversational and concise.\n\n"
        + f"Project: {project.name}\n"
        + f"Template: {project.template_id} (Next.js + serverless backend)\n\n"
        + conversation_hint
        + "User: " + user_message.strip() + "\n\n"
        + "Respond conversationally. Return JSON with:\n"
        + "{\n"
        + '  "assistant": {"role": "assistant", "content": "Your conversational response (2-3 sentences max)"},\n'
        + '  "followups": ["question1", "question2"] or [],\n'
        + '  "suggested_action": "ask_followups" | "build_preview",\n'
        + '  "spec_yaml": "yaml spec if ready to build"\n'
        + "}\n\n"
        + "Guidelines:\n"
        + "- Be helpful but brief. No walls of text or technical specs in your response.\n"
        + "- If you need more details, ask 1-2 specific questions in followups.\n"
        + "- Only suggest build_preview when you have enough info.\n"
        + "- Keep assistant.content conversational, like you're chatting with a friend.\n"
    )


def _start_codebuild(project_name: str, project_id: str, build_id: str, overrides: Optional[dict[str, str]] = None) -> None:
    if not boto3:
        raise RuntimeError("boto3 not available")
    client = boto3.client("codebuild")
    extra = overrides or {}
    resp = client.start_build(
        projectName=project_name,
        environmentVariablesOverride=[
            {"name": "PROJECT_ID", "value": project_id, "type": "PLAINTEXT"},
            {"name": "BUILD_ID", "value": build_id, "type": "PLAINTEXT"},
            *[
                {"name": k, "value": v, "type": "PLAINTEXT"}
                for k, v in extra.items()
                if v is not None and str(v) != ""
            ],
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
    Chat endpoint for conversational app building.

    When USE_AGENT_CHAT=1 (default), uses the intelligent agent framework.
    Otherwise falls back to the legacy deterministic implementation.
    """
    user_id = _require_user(x_user_id)
    repo = get_repo()
    p = repo.get_project(user_id, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")

    msg = (payload.message or "").strip()
    history = payload.history or []

    # Use agent-based chat when enabled
    if _use_agents() and _backend_api_url():
        try:
            result = run_async(process_chat_with_agents(
                project_id=project_id,
                project_name=p.name,
                template_id=p.template_id,
                message=msg,
                history=[{"role": h.role, "content": h.content} for h in history],
                user_id=user_id,
                auto_preview=payload.auto_preview,
                templates_dir=TEMPLATES_DIR,
                modules_dir=MODULES_DIR,
            ))

            # Update project with spec if generated
            if result.get("spec_yaml"):
                p.spec_yaml = result["spec_yaml"]
                p.spec_markdown = result.get("spec_markdown")
                p.spec_updated_at = now_iso()
                repo.put_project(user_id, p)

            return ProjectChatResponse(
                assistant=result["assistant"],
                followups=result.get("followups", []),
                suggested_action=result.get("suggested_action", "ask_followups"),
                plan=result.get("plan"),
            )
        except Exception as exc:
            # Fall through to legacy implementation on error
            import traceback
            traceback.print_exc()
            pass

    # Legacy implementation below
    lower = msg.lower()
    wants_build = any(k in lower for k in ["build preview", "preview", "deploy", "ship", "run build"])
    detected_modules = _detect_modules_from_text(msg)
    wants_no_modules = any(k in lower for k in ["no modules", "without modules", "no module", "without module"])

    # Default deterministic fallbacks if backend AI isn't configured.
    followups: list[str] = []
    suggested_action = "ask_followups"
    spec_md: Optional[str] = None
    spec_yaml: Optional[str] = None
    assistant_content = ""

    if _backend_api_url():
        try:
            raw = _ai_generate(user_id, _spec_prompt(p, msg, history))
            parsed = _extract_json(raw) or {}
            
            # Extract conversational response
            assistant_response = parsed.get("assistant", {})
            if isinstance(assistant_response, dict):
                assistant_content = assistant_response.get("content", "")
            else:
                assistant_content = ""
            
            followups = [q for q in (parsed.get("followups") or []) if isinstance(q, str)]
            parsed_suggestion = parsed.get("suggested_action") or suggested_action
            if isinstance(parsed.get("spec_yaml"), str):
                spec_yaml = parsed.get("spec_yaml")
            if spec_yaml and not spec_md:
                spec_md = _spec_markdown_from_yaml(spec_yaml)

            # Deterministic no-modules spec for quick smoke tests (avoids generic fallback).
            if wants_no_modules and not spec_yaml:
                spec_yaml = yaml.safe_dump(
                    {
                        "base_template": p.template_id,
                        "modules": [],
                        "app": {
                            "name": p.name,
                            "notes": "no-modules smoke test spec generated deterministically",
                        },
                        "data_entities": [
                            {
                                "name": "Todo",
                                "keys": [{"field": "todo_id", "type": "string"}],
                                "attributes": [
                                    {"field": "title", "type": "string"},
                                    {"field": "completed", "type": "boolean"},
                                ],
                            }
                        ],
                        "backend_apis": [],
                        "acceptance_criteria": [
                            "Home page loads",
                            "Dashboard shows a Todo empty state when none",
                            "User can add/remove todos client-side",
                        ],
                    },
                    sort_keys=False,
                    allow_unicode=True,
                )
                spec_md = _spec_markdown_from_yaml(spec_yaml)

            # Deterministic fallback: if user explicitly mentions module ids and the model didn't
            # include a spec_yaml, generate a minimal spec_yaml to enable composition testing.
            if detected_modules and not spec_yaml:
                spec_yaml = yaml.safe_dump(
                    {
                        "base_template": p.template_id,
                        "modules": [{"id": mid} for mid in detected_modules],
                        "app": {"name": p.name, "notes": "modules selected deterministically from user message"},
                        "backend_apis": [],
                        "data_entities": [],
                        "acceptance_criteria": ["Preview renders and module patches apply"],
                    },
                    sort_keys=False,
                    allow_unicode=True,
                )
                spec_md = spec_md or _spec_markdown_from_yaml(spec_yaml)

            # Explicit override for testing: allow user to force a "no modules" manifest.
            if wants_no_modules and spec_yaml:
                try:
                    doc = yaml.safe_load(spec_yaml) or {}
                    if isinstance(doc, dict):
                        doc["modules"] = []
                        spec_yaml = yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)
                        spec_md = _spec_markdown_from_yaml(spec_yaml)
                except Exception:
                    pass

            # Some models will return followups but omit spec_markdown.
            # Ensure the UI always gets at least a usable skeleton spec.
            if not spec_md and not spec_yaml:
                spec_yaml = (
                    f"goal: Build V1 of {p.name} on template {p.template_id}\n"
                    "target_users:\n"
                    "  - SaaS founders validating v1\n"
                    "key_use_cases:\n"
                    "  - title: Dashboard\n"
                    "    description: View KPIs and quick links\n"
                    "ux_modules:\n"
                    "  - id: dashboard\n"
                    "    description: KPI cards + quick actions\n"
                    "data_entities:\n"
                    "  - name: Project\n"
                    "    keys:\n"
                    "      - field: project_id\n"
                    "        type: string\n"
                    "    attributes:\n"
                    "      - field: name\n"
                    "        type: string\n"
                    "backend_apis:\n"
                    "  - route: GET /api/projects\n"
                    "    handler: backend/lambdas/api/projects/list.py\n"
                    "automations: []\n"
                    "integrations:\n"
                    "  - name: clerk\n"
                    "infra_overrides: {}\n"
                    "acceptance_criteria:\n"
                    "  - Projects list loads for signed-in users\n"
                )
                spec_md = _spec_markdown_from_yaml(spec_yaml)

            # Persist spec onto the project for later patch/build steps.
            p.spec_yaml = spec_yaml
            p.spec_markdown = spec_md
            p.spec_updated_at = now_iso()
            repo.put_project(user_id, p)

            if followups:
                suggested_action = "ask_followups"
            elif payload.auto_preview or wants_build or parsed_suggestion == "build_preview":
                suggested_action = "build_preview"
            else:
                suggested_action = "ask_followups"
        except Exception as exc:  # pylint: disable=broad-except
            # Keep chat working even if AI fails; return a minimal message + error hint.
            spec_md = None
            followups = [
                "AI spec generation failed. Do you want to proceed with a minimal preview build anyway?",
            ]
            suggested_action = "ask_followups"
            msg = msg + f"\n\n(AI error: {exc})"
    else:
        followups = [
            "What’s the primary user and core workflow for this app?",
            "Any required integrations (auth, Stripe, email) for V1?",
            "Should we prioritize speed (minimal) or completeness (more screens, roles, audit log)?",
        ]
        if wants_build or payload.auto_preview:
            followups = []
            suggested_action = "build_preview"
        spec_yaml = (
            f"goal: Prototype {p.name} using template {p.template_id}\n"
            "target_users:\n"
            "  - Internal testing\n"
            "key_use_cases:\n"
            "  - title: Demo\n"
            "    description: Show placeholder content\n"
            "ux_modules: []\n"
            "data_entities: []\n"
            "backend_apis: []\n"
            "automations: []\n"
            "integrations: []\n"
            "infra_overrides: {}\n"
            "acceptance_criteria:\n"
            "  - Preview renders without runtime errors\n"
        )
        spec_md = spec_md or _spec_markdown_from_yaml(spec_yaml)
        p.spec_yaml = spec_yaml
        p.spec_markdown = spec_md
        p.spec_updated_at = now_iso()
        repo.put_project(user_id, p)

    plan = (
        "Plan:\n"
        "- Turn chat into a spec (Goal, UX, Data model, API routes)\n"
        "- Generate a patch\n"
        "- Run CodeBuild preview (tests + build)\n"
        "- Publish a hosted preview URL\n"
    )

    if followups:
        suggested_action = "ask_followups"
    
    # Use conversational response if available, otherwise fallback to technical format
    if _backend_api_url() and assistant_content:
        assistant_text = assistant_content
    else:
        # Fallback for local development or when AI fails
        assistant_text = f"Got it! Let's build {p.name} using the {p.template_id} template."
        if followups:
            assistant_text += " I have a few questions to make sure we build exactly what you need."

    return ProjectChatResponse(
        assistant={"role": "assistant", "content": assistant_text},
        followups=followups,
        suggested_action=suggested_action,  # type: ignore[arg-type]
        plan=plan,
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
        # preview_url points to the runnable static preview (published by CodeBuild).
        b.artifacts.preview_url = f"{preview_base}/p/{b.project_id}/{b.build_id}/app/index.html"
        b.artifacts.checks_report_url = f"{preview_base}/p/{b.project_id}/{b.build_id}/report/index.html"
        repo.update_build(user_id, b)

    # If we have a spec, generate a patch and upload spec+patch to S3 for CodeBuild to consume.
    patch_key: str = ""
    module_patch_keys: list[str] = []
    if cb_project and _backend_api_url() and project and _artifacts_bucket():
        try:
            bucket = _artifacts_bucket()
            spec_md_key = f"projects/{project_id}/builds/{b.build_id}/spec.md"
            spec_yaml_key = f"projects/{project_id}/builds/{b.build_id}/spec.yaml"
            patch_key = f"projects/{project_id}/builds/{b.build_id}/patch.diff"
            if project.spec_markdown:
                _s3_put_text(bucket, spec_md_key, project.spec_markdown, "text/markdown; charset=utf-8")
            if project.spec_yaml:
                _s3_put_text(bucket, spec_yaml_key, project.spec_yaml, "text/yaml; charset=utf-8")

            # Deterministic module composition: upload module patch diffs if selected in spec_yaml.
            module_patch_keys = _module_patch_keys_for_build(project, project_id, b.build_id, bucket)

            patch_raw = _ai_generate(user_id, _patch_prompt(project))
            patch = _normalize_patch_paths(_extract_patch(patch_raw))
            if patch:
                _s3_put_text(bucket, patch_key, patch, "text/plain; charset=utf-8")
                if b.artifacts:
                    b.artifacts.changes_url = f"s3://{bucket}/{patch_key}"
                repo.update_build(user_id, b)
            else:
                patch_key = ""
        except Exception as exc:  # pylint: disable=broad-except
            # Don't fail the build creation; just omit patch and proceed with template build.
            if b.artifacts:
                b.artifacts.changes_url = f"patch_generation_failed: {exc}"
            repo.update_build(user_id, b)

    if cb_project:
        # In AWS, CodeBuild will publish the preview to S3/CloudFront.
        try:
            template_key = os.getenv("FACTORY_TEMPLATE_KEY", "").strip()
            provider_build_id = _start_codebuild(
                cb_project,
                b.project_id,
                b.build_id,
                overrides={
                    **({"TEMPLATE_KEY": template_key} if template_key else {}),
                    **({"PATCH_KEY": patch_key} if patch_key else {}),
                    **(
                        {"MODULE_PATCH_KEYS": ",".join(module_patch_keys)}
                        if module_patch_keys
                        else {}
                    ),
                }
                or None,
            )
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


class CodeGenRequest(BaseModel):
    """Request for agent-based code generation."""
    use_validation: bool = Field(default=True, description="Run validation before build")
    max_attempts: int = Field(default=3, ge=1, le=5, description="Max validation retry attempts")


class CodeGenResponse(BaseModel):
    """Response from agent-based code generation."""
    success: bool
    phase: str
    files_count: int
    validated: bool
    errors: list[str] = Field(default_factory=list)
    ready_for_build: bool
    patch_uploaded: bool = False
    build_id: Optional[str] = None


@app.post("/v1/projects/{project_id}/generate", response_model=CodeGenResponse)
def generate_code(
    project_id: str,
    payload: CodeGenRequest,
    background: BackgroundTasks,
    x_user_id: Optional[str] = Header(default=None),
) -> CodeGenResponse:
    """
    Generate code using the agent framework with validation.

    This endpoint:
    1. Takes the spec from the project
    2. Generates code using AI with full context
    3. Validates the code (lint, typecheck)
    4. Retries with error feedback if validation fails
    5. Uploads the patch to S3 for CodeBuild

    Use this instead of build-preview for flexible code generation.
    """
    user_id = _require_user(x_user_id)
    repo = get_repo()
    project = repo.get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Not found")

    if not project.spec_yaml:
        return CodeGenResponse(
            success=False,
            phase="error",
            files_count=0,
            validated=False,
            errors=["No specification available. Use /chat to generate a spec first."],
            ready_for_build=False,
        )

    if not _backend_api_url():
        return CodeGenResponse(
            success=False,
            phase="error",
            files_count=0,
            validated=False,
            errors=["BACKEND_API_URL not configured"],
            ready_for_build=False,
        )

    # Get template manifest for context
    skeleton_manifest: list[str] = []
    bucket = _artifacts_bucket()
    template_key = _factory_template_key()
    if bucket and template_key:
        try:
            skeleton_manifest = _template_manifest(bucket, template_key)
        except Exception:
            pass

    try:
        result = run_async(generate_code_with_agents(
            project_id=project_id,
            project_name=project.name,
            template_id=project.template_id,
            spec_yaml=project.spec_yaml,
            user_id=user_id,
            skeleton_manifest=skeleton_manifest,
            templates_dir=TEMPLATES_DIR,
            modules_dir=MODULES_DIR,
        ))

        if not result.get("success"):
            return CodeGenResponse(
                success=False,
                phase=result.get("phase", "failed"),
                files_count=len(result.get("files", [])),
                validated=False,
                errors=[result.get("error", "Code generation failed")],
                ready_for_build=False,
            )

        # Upload patch to S3 for CodeBuild
        patch_uploaded = False
        build_id = None
        if result.get("patch_diff") and bucket:
            try:
                # Create a build record
                _, b = repo.create_build(user_id, project_id, "preview")
                build_id = b.build_id
                project.last_build_id = build_id
                repo.put_project(user_id, project)

                # Upload artifacts
                patch_key = f"projects/{project_id}/builds/{build_id}/patch.diff"
                _s3_put_text(bucket, patch_key, result["patch_diff"], "text/plain; charset=utf-8")

                if project.spec_yaml:
                    spec_key = f"projects/{project_id}/builds/{build_id}/spec.yaml"
                    _s3_put_text(bucket, spec_key, project.spec_yaml, "text/yaml; charset=utf-8")

                # Upload individual files as well for debugging
                files_manifest = []
                for fc in result.get("files", []):
                    file_key = f"projects/{project_id}/builds/{build_id}/files/{fc['path']}"
                    _s3_put_text(bucket, file_key, fc["content"], "text/plain; charset=utf-8")
                    files_manifest.append(fc["path"])

                manifest_key = f"projects/{project_id}/builds/{build_id}/files/manifest.json"
                _s3_put_text(bucket, manifest_key, json.dumps(files_manifest), "application/json")

                if b.artifacts:
                    b.artifacts.changes_url = f"s3://{bucket}/{patch_key}"
                repo.update_build(user_id, b)
                patch_uploaded = True

            except Exception as exc:
                return CodeGenResponse(
                    success=True,  # Code gen succeeded, just upload failed
                    phase=result.get("phase", "validated"),
                    files_count=result.get("files_count", 0),
                    validated=result.get("validated", False),
                    errors=[f"Upload failed: {exc}"],
                    ready_for_build=False,
                    patch_uploaded=False,
                )

        return CodeGenResponse(
            success=True,
            phase=result.get("phase", "validated"),
            files_count=result.get("files_count", 0),
            validated=result.get("validated", False),
            errors=[],
            ready_for_build=result.get("validated", False) and patch_uploaded,
            patch_uploaded=patch_uploaded,
            build_id=build_id,
        )

    except Exception as exc:
        import traceback
        traceback.print_exc()
        return CodeGenResponse(
            success=False,
            phase="error",
            files_count=0,
            validated=False,
            errors=[str(exc)],
            ready_for_build=False,
        )


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": "0.2", "agents_enabled": _use_agents()}


ORCH_ROOT = Path(__file__).resolve().parents[1]
FACTORY_DIR = ORCH_ROOT / "factory"
TEMPLATES_DIR = FACTORY_DIR / "templates"
MODULES_DIR = FACTORY_DIR / "modules"
_TEMPLATE_CACHE: dict[str, dict] = {}
_MODULE_CACHE: dict[str, dict] = {}
