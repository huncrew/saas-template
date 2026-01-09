from __future__ import annotations

import asyncio
import os
import json
import threading
import time
import difflib
from pathlib import Path
from typing import Optional
import re
from urllib import request as urlrequest
from urllib.error import HTTPError, URLError
from io import BytesIO
import zipfile

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
    smart_generate_code,
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
    # When agents are enabled, actually generate code
    b = repo.get_build(user_id, build_id)
    if not b:
        return
    b.status = "running"
    b.started_at = now_iso()
    repo.update_build(user_id, b)

    generated_files = []
    patch_diff = ""

    # Try agent-based code generation for local dev
    if _use_agents() and b.type == "preview":
        try:
            project = repo.get_project(user_id, b.project_id)
            if project and project.spec_yaml:
                from app.agents.integration import generate_code_with_agents, run_async

                gen_result = run_async(generate_code_with_agents(
                    project_id=b.project_id,
                    project_name=project.name,
                    template_id=project.template_id,
                    spec_yaml=project.spec_yaml,
                    user_id=user_id,
                    skeleton_manifest=[],
                    templates_dir=TEMPLATES_DIR,
                    modules_dir=MODULES_DIR,
                ))

                if gen_result.get("success"):
                    generated_files = gen_result.get("files", [])
                    patch_diff = gen_result.get("patch_diff", "")
                else:
                    print(f"[SIMULATE_BUILD] Agent code gen failed: {gen_result.get('error')}")
        except Exception as e:
            print(f"[SIMULATE_BUILD] Agent code gen error: {e}")
            import traceback
            traceback.print_exc()
    else:
        # Just simulate delay without code gen
        time.sleep(2.5 if b.type == "preview" else 3.5)

    b = repo.get_build(user_id, build_id)
    if not b:
        return
    b.status = "succeeded"
    b.finished_at = now_iso()
    if b.type == "preview":
        # Placeholder URL – in AWS this will be CloudFront /p/{project}/{build}/
        b.artifacts.preview_url = f"http://localhost:3000/p/{b.project_id}/{b.build_id}/"

    # Store generated files in a module-level cache for the preview endpoint to access
    if generated_files or patch_diff:
        _BUILD_FILES_CACHE[build_id] = {
            "files": generated_files,
            "patch_diff": patch_diff,
        }

    repo.update_build(user_id, b)

# Cache for generated files (for local preview)
_BUILD_FILES_CACHE: dict[str, dict] = {}

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


def _template_file_text(bucket: str, key: str, suffix_path: str) -> str:
    """
    Load a single text file from the template zip in S3 by suffix match.
    This allows templates to be zipped with a top-level folder.
    """
    if not boto3:
        raise RuntimeError("boto3 not available")
    s3 = boto3.client("s3")
    obj = s3.get_object(Bucket=bucket, Key=key)
    data = obj["Body"].read()
    z = zipfile.ZipFile(BytesIO(data))
    suffix = suffix_path.lstrip("/")
    matches = [n for n in z.namelist() if n.endswith(suffix)]
    if not matches:
        raise FileNotFoundError(f"Template file not found: *{suffix}")
    name = sorted(matches, key=len)[0]
    raw = z.read(name)
    return raw.decode("utf-8")


def _unified_diff(a_path: str, a_text: str, b_path: str, b_text: str) -> str:
    a_lines = (a_text or "").splitlines(keepends=True)
    b_lines = (b_text or "").splitlines(keepends=True)
    diff = difflib.unified_diff(
        a_lines,
        b_lines,
        fromfile=f"a/{a_path}",
        tofile=f"b/{b_path}",
        lineterm="\n",
    )
    return "".join(diff)


def _todo_smoke_files_prompt(project: Project, current_dashboard_tsx: str) -> str:
    """
    For smoke tests, ask the model for full file contents (not a diff) so we can
    generate a correct unified diff ourselves.
    """
    return (
        "Return ONLY valid JSON (no markdown fences).\n"
        "Generate the full contents for this file:\n"
        "- frontend/src/app/dashboard/page.tsx\n\n"
        "Constraints:\n"
        "- Client-side only.\n"
        "- The file MUST start with the directive: \"use client\";\n"
        "- Implement: todos list, add todo, toggle complete, delete, empty state.\n"
        "- Keep imports consistent with the template (prefer @/components/ui/*).\n"
        "- Do NOT invent @/components barrel imports.\n"
        "- Keep the file syntactically valid (all braces closed).\n\n"
        "CURRENT FILE (edit this; keep structure as much as possible):\n"
        + current_dashboard_tsx
        + "\n\n"
        "JSON format:\n"
        '{\"files\":[{\"path\":\"frontend/src/app/dashboard/page.tsx\",\"content\":\"...\"}]}\n\n'
        + "SPEC (YAML):\n"
        + ((project.spec_yaml or "").strip() + "\n")
    )


def _sanitize_client_directive(tsx: str) -> str:
    """
    Ensure the dashboard file is a valid Next.js client component.
    Models sometimes emit a stray `use client;` line without quotes (invalid TSX).
    """
    if not tsx:
        return tsx
    lines = tsx.splitlines()
    cleaned: list[str] = []
    for ln in lines:
        if ln.strip() in {"use client;", "use client"}:
            continue
        cleaned.append(ln)
    out = "\n".join(cleaned).lstrip()
    if not out.startswith('"use client"') and not out.startswith("'use client'"):
        out = '"use client";\n\n' + out
    return out


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
    # Collapse duplicate git prefixes (common LLM mistake).
    for _ in range(2):
        t = t.replace("diff --git a/a/", "diff --git a/")
        t = t.replace("diff --git b/b/", "diff --git b/")
        t = t.replace(" a/a/", " a/")
        t = t.replace(" b/b/", " b/")
        t = t.replace("--- a/a/", "--- a/")
        t = t.replace("+++ b/b/", "+++ b/")
    return t + "\n"


def _sanitize_patch(patch_text: str) -> str:
    """
    Final cleanup of model diffs to increase `git apply` success.
    - Normalizes duplicate a/a and b/b prefixes
    - Fixes a common model failure mode where a new `diff --git ...` header is
      accidentally emitted as a hunk line (prefixed with '+').
    """
    t = _normalize_patch_paths(patch_text)
    if not t:
        return ""
    out_lines: list[str] = []
    for line in t.splitlines():
        if line.startswith("+diff --git "):
            out_lines.append(line[1:])
            continue
        if line.startswith("+index ") and out_lines and out_lines[-1].startswith("diff --git "):
            out_lines.append(line[1:])
            continue
        if line.startswith("+--- ") and out_lines and out_lines[-1].startswith("index "):
            out_lines.append(line[1:])
            continue
        if line.startswith("++++ ") and out_lines and out_lines[-1].startswith("--- "):
            # extremely rare, but keep symmetry
            out_lines.append(line[1:])
            continue
        if line.startswith("+++ ") and out_lines and out_lines[-1].startswith("--- "):
            out_lines.append(line)
            continue
        out_lines.append(line)
    return "\n".join(out_lines).rstrip("\n") + "\n"


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
    is_todo_smoke = False
    if spec_yaml:
        low = spec_yaml.lower()
        is_todo_smoke = ("no-modules smoke test" in low) or ("\n- name: todo" in low) or ("name: todo" in low)
    return (
        "You are an expert code generator.\n"
        "Generate a git-apply compatible unified diff patch to implement the spec.\n"
        "Constraints:\n"
        "- Output ONLY the diff (no markdown fences, no commentary).\n"
        "- Output must be a valid unified diff starting with 'diff --git ...'.\n"
        "- Do NOT emit a new 'diff --git' header inside a hunk (never prefix it with '+').\n"
        "- The repo root is a template zip with frontend/ (Next.js 15 static export) and backend/ (python lambdas).\n"
        "- IMPORTANT: Only modify/add files that exist in the template manifest, or add new files under existing directories.\n"
        "- Use paths like a/frontend/... b/frontend/... (relative to repo root).\n"
        "- Keep changes minimal and focused.\n"
        "- Prefer small edits to existing files over introducing new files/dependencies.\n\n"
        + (
            "SMOKE TEST MODE (Todo, no modules):\n"
            "- ONLY modify frontend/src/app/dashboard/page.tsx\n"
            "- Keep it client-side only; do NOT add backend code.\n"
            "- Do NOT create new files or edit types; inline any small types in the file.\n"
            "- Ensure the resulting TSX file is syntactically valid (all braces closed).\n\n"
            if is_todo_smoke
            else ""
        )
        + "Implementation guidance:\n"
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
        "maxTokens": 8000,
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


@app.get("/v1/projects/{project_id}/architecture")
def get_architecture(project_id: str, x_user_id: Optional[str] = Header(default=None)) -> dict:
    """
    Get architecture diagrams for a project.

    Returns Mermaid diagrams generated from the project's spec:
    - architecture_diagram: High-level architecture flowchart
    - entity_diagram: Data entity relationships (ER diagram)
    """
    from .agents.diagram_generator import generate_architecture_diagram, generate_entity_diagram

    user_id = _require_user(x_user_id)
    repo = get_repo()
    p = repo.get_project(user_id, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")

    if not p.spec_yaml:
        return {
            "project_id": project_id,
            "architecture_diagram": None,
            "entity_diagram": None,
            "message": "No specification available. Complete chat to generate architecture.",
        }

    return {
        "project_id": project_id,
        "architecture_diagram": generate_architecture_diagram(p.spec_yaml),
        "entity_diagram": generate_entity_diagram(p.spec_yaml),
    }


@app.get("/v1/projects/{project_id}/chat-history")
def get_chat_history(
    project_id: str,
    limit: int = 50,
    x_user_id: Optional[str] = Header(default=None),
) -> dict:
    user_id = _require_user(x_user_id)
    repo = get_repo()
    p = repo.get_project(user_id, project_id)
    if not p:
        raise HTTPException(status_code=404, detail="Not found")
    msgs = repo.list_chat_messages(user_id, project_id, limit=limit)
    return {"project_id": project_id, "messages": msgs}


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
    # Persisted chat context is required for reliable AI builds.
    persisted = repo.list_chat_messages(user_id, project_id, limit=50) or []
    history = payload.history or []
    lower = msg.lower()
    print(f"[CHAT DEBUG] Received payload: message={msg[:30]}, auto_preview={payload.auto_preview}, history_type={type(payload.history)}, history_len={len(history)}")
    wants_no_modules = any(k in lower for k in ["no modules", "without modules", "no module", "without module"])

    def _redact(text: str) -> str:
        t = text or ""
        # best-effort: common secret formats
        t = re.sub(r"sk-[A-Za-z0-9_\\-]{20,}", "[REDACTED_OPENAI_KEY]", t)
        t = re.sub(r"sk_live_[A-Za-z0-9]{20,}", "[REDACTED_CLERK_SECRET]", t)
        t = re.sub(r"AKIA[0-9A-Z]{16}", "[REDACTED_AWS_ACCESS_KEY]", t)
        return t

    msg_redacted = _redact(msg)
    # Store the user message immediately (durable context).
    try:
        repo.append_chat_message(user_id, project_id, "user", msg_redacted)
    except Exception as exc:
        print(f"[CHAT] failed to persist user message: {exc}")

    # Merge persisted context + request-provided history for AI calls.
    merged_history: list[ChatMessage] = []
    for m in persisted:
        try:
            merged_history.append(ChatMessage(role=m.get("role"), content=m.get("content", "")))
        except Exception:
            continue
    merged_history.extend(history)

    # Use agent-based chat when enabled
    print(f"[CHAT] use_agents={_use_agents()}, has_backend={bool(_backend_api_url())}, msg={msg[:50]}, history_len={len(history)}")
    # For quick smoke tests, bypass agents so we can deterministically control the manifest.
    if _use_agents() and _backend_api_url() and not wants_no_modules:
        try:
            print(f"[CHAT] Calling agent...")
            result = run_async(process_chat_with_agents(
                project_id=project_id,
                project_name=p.name,
                template_id=p.template_id,
                message=msg_redacted,
                history=[{"role": h.role, "content": h.content} for h in merged_history],
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

            # Persist assistant message for durable context.
            try:
                assistant_obj = result.get("assistant") or {}
                assistant_text = (
                    assistant_obj.get("content", "") if isinstance(assistant_obj, dict) else ""
                )
                repo.append_chat_message(user_id, project_id, "assistant", _redact(assistant_text or "Ok."))
            except Exception as exc:
                print(f"[CHAT] failed to persist assistant message (agents path): {exc}")

            return ProjectChatResponse(
                assistant=result["assistant"],
                followups=result.get("followups", []),
                suggested_action=result.get("suggested_action", "ask_followups"),
                plan=result.get("plan"),
                architecture_diagram=result.get("architecture_diagram"),
                entity_diagram=result.get("entity_diagram"),
            )
        except Exception as exc:
            # Fall through to legacy implementation on error
            import traceback
            traceback.print_exc()
            pass

    # Legacy implementation below
    wants_build = any(k in lower for k in ["build preview", "preview", "deploy", "ship", "run build"])
    detected_modules = _detect_modules_from_text(msg)

    # Default deterministic fallbacks if backend AI isn't configured.
    followups: list[str] = []
    suggested_action = "ask_followups"
    spec_md: Optional[str] = None
    spec_yaml: Optional[str] = None
    assistant_content = ""

    if _backend_api_url():
        try:
            raw = _ai_generate(user_id, _spec_prompt(p, msg_redacted, merged_history))
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
            if wants_no_modules and ("todo" in lower or "to-do" in lower or "todos" in lower):
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

    # If we have a spec, generate code and upload to S3 for CodeBuild to consume.
    patch_key: str = ""
    files_manifest_key: str = ""  # Option A: direct file writes
    module_patch_keys: list[str] = []
    bucket = _artifacts_bucket()

    if cb_project and _backend_api_url() and project and bucket:
        try:
            spec_md_key = f"projects/{project_id}/builds/{b.build_id}/spec.md"
            spec_yaml_key = f"projects/{project_id}/builds/{b.build_id}/spec.yaml"
            patch_key = f"projects/{project_id}/builds/{b.build_id}/patch.diff"

            if project.spec_markdown:
                _s3_put_text(bucket, spec_md_key, project.spec_markdown, "text/markdown; charset=utf-8")
            if project.spec_yaml:
                _s3_put_text(bucket, spec_yaml_key, project.spec_yaml, "text/yaml; charset=utf-8")

            spec_yaml_lower = (project.spec_yaml or "").strip().lower()
            is_todo_smoke = ("no-modules smoke test" in spec_yaml_lower) and ("name: todo" in spec_yaml_lower)

            # Use agent-based code generation when enabled (flexible, validated)
            if _use_agents() and project.spec_yaml and not is_todo_smoke:
                try:
                    # Get template manifest for context
                    skeleton_manifest: list[str] = []
                    template_key = _factory_template_key()
                    if template_key:
                        try:
                            skeleton_manifest = _template_manifest(bucket, template_key)
                        except Exception:
                            pass

                    # Generate code with agents (includes validation retry loop)
                    gen_result = run_async(generate_code_with_agents(
                        project_id=project_id,
                        project_name=project.name,
                        template_id=project.template_id,
                        spec_yaml=project.spec_yaml,
                        user_id=user_id,
                        skeleton_manifest=skeleton_manifest,
                        templates_dir=TEMPLATES_DIR,
                        modules_dir=MODULES_DIR,
                    ))

                    if gen_result.get("success") and gen_result.get("patch_diff"):
                        patch = gen_result["patch_diff"]
                        _s3_put_text(bucket, patch_key, patch, "text/plain; charset=utf-8")

                        # Upload files manifest (Option A: direct file writes)
                        files_manifest = [
                            {"path": fc["path"], "content": fc["content"]}
                            for fc in gen_result.get("files", [])
                        ]
                        files_manifest_key = f"projects/{project_id}/builds/{b.build_id}/files.json"
                        _s3_put_text(bucket, files_manifest_key, json.dumps(files_manifest), "application/json")

                        # Also upload individual files for debugging/inspection
                        for fc in gen_result.get("files", []):
                            file_key = f"projects/{project_id}/builds/{b.build_id}/files/{fc['path']}"
                            _s3_put_text(bucket, file_key, fc["content"], "text/plain; charset=utf-8")

                        # Upload security findings report
                        security_findings = gen_result.get("security_findings", [])
                        security_passed = gen_result.get("security_passed", True)
                        security_report = {
                            "passed": security_passed,
                            "findings": security_findings,
                            "summary": f"{'No critical/high issues' if security_passed else 'Security issues found'} - {len(security_findings)} total findings",
                        }
                        security_key = f"projects/{project_id}/builds/{b.build_id}/security.json"
                        _s3_put_text(bucket, security_key, json.dumps(security_report, indent=2), "application/json")

                        if b.artifacts:
                            b.artifacts.changes_url = f"s3://{bucket}/{patch_key}"
                        repo.update_build(user_id, b)
                    else:
                        # Agent generation failed, fall through to legacy
                        raise RuntimeError(gen_result.get("error", "Agent code generation failed"))

                except Exception as agent_exc:
                    # Fall back to legacy patch generation
                    import traceback
                    traceback.print_exc()
                    print(f"Agent code gen failed, falling back to legacy: {agent_exc}")

                    # Legacy: deterministic module patches
                    module_patch_keys = _module_patch_keys_for_build(project, project_id, b.build_id, bucket)

                    spec_yaml = (project.spec_yaml or "").strip().lower()
                    is_todo_smoke = ("no-modules smoke test" in spec_yaml) and ("name: todo" in spec_yaml)
                    if is_todo_smoke:
                        template_key = _factory_template_key() or "templates/base-skeleton.zip"
                        old_text = _template_file_text(bucket, template_key, "frontend/src/app/dashboard/page.tsx")
                        raw = _ai_generate(user_id, _todo_smoke_files_prompt(project, old_text))
                        parsed = _extract_json(raw) or {}
                        files = parsed.get("files") or []
                        new_text = ""
                        if isinstance(files, list):
                            for f in files:
                                if isinstance(f, dict) and f.get("path") == "frontend/src/app/dashboard/page.tsx":
                                    new_text = f.get("content") or ""
                                    break
                        new_text = _sanitize_client_directive(new_text or "")

                        # Option A: upload a files manifest so CodeBuild writes files directly (more reliable than diffs).
                        files_manifest_key = f"projects/{project_id}/builds/{b.build_id}/files.json"
                        _s3_put_text(
                            bucket,
                            files_manifest_key,
                            json.dumps([{"path": "frontend/src/app/dashboard/page.tsx", "content": new_text}]),
                            "application/json",
                        )
                        _s3_put_text(
                            bucket,
                            f"projects/{project_id}/builds/{b.build_id}/files/frontend/src/app/dashboard/page.tsx",
                            new_text,
                            "text/plain; charset=utf-8",
                        )

                        patch = _unified_diff(
                            "frontend/src/app/dashboard/page.tsx",
                            old_text,
                            "frontend/src/app/dashboard/page.tsx",
                            new_text,
                        )
                    else:
                        patch_raw = _ai_generate(user_id, _patch_prompt(project))
                        patch = _sanitize_patch(_extract_patch(patch_raw))
                    if patch:
                        _s3_put_text(bucket, patch_key, patch, "text/plain; charset=utf-8")
                        if b.artifacts:
                            b.artifacts.changes_url = f"s3://{bucket}/{patch_key}"
                        repo.update_build(user_id, b)
                    else:
                        patch_key = ""
            else:
                # Legacy approach: monolithic patch generation
                module_patch_keys = _module_patch_keys_for_build(project, project_id, b.build_id, bucket)

                spec_yaml = (project.spec_yaml or "").strip().lower()
                is_todo_smoke = ("no-modules smoke test" in spec_yaml) and ("name: todo" in spec_yaml)
                if is_todo_smoke:
                    template_key = _factory_template_key() or "templates/base-skeleton.zip"
                    old_text = _template_file_text(bucket, template_key, "frontend/src/app/dashboard/page.tsx")
                    raw = _ai_generate(user_id, _todo_smoke_files_prompt(project, old_text))
                    parsed = _extract_json(raw) or {}
                    files = parsed.get("files") or []
                    new_text = ""
                    if isinstance(files, list):
                        for f in files:
                            if isinstance(f, dict) and f.get("path") == "frontend/src/app/dashboard/page.tsx":
                                new_text = f.get("content") or ""
                                break
                    new_text = _sanitize_client_directive(new_text or "")

                    # Option A: upload a files manifest so CodeBuild writes files directly (more reliable than diffs).
                    files_manifest_key = f"projects/{project_id}/builds/{b.build_id}/files.json"
                    _s3_put_text(
                        bucket,
                        files_manifest_key,
                        json.dumps([{"path": "frontend/src/app/dashboard/page.tsx", "content": new_text}]),
                        "application/json",
                    )
                    _s3_put_text(
                        bucket,
                        f"projects/{project_id}/builds/{b.build_id}/files/frontend/src/app/dashboard/page.tsx",
                        new_text,
                        "text/plain; charset=utf-8",
                    )

                    patch = _unified_diff(
                        "frontend/src/app/dashboard/page.tsx",
                        old_text,
                        "frontend/src/app/dashboard/page.tsx",
                        new_text,
                    )
                else:
                    patch_raw = _ai_generate(user_id, _patch_prompt(project))
                    patch = _sanitize_patch(_extract_patch(patch_raw))
                if patch:
                    _s3_put_text(bucket, patch_key, patch, "text/plain; charset=utf-8")
                    if b.artifacts:
                        b.artifacts.changes_url = f"s3://{bucket}/{patch_key}"
                    repo.update_build(user_id, b)
                else:
                    patch_key = ""

        except Exception as exc:  # pylint: disable=broad-except
            # Don't fail the build creation; just omit patch and proceed with template build.
            import traceback
            traceback.print_exc()
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
                    **({"FILES_MANIFEST_KEY": files_manifest_key} if files_manifest_key else {}),
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


@app.get("/v1/builds/{build_id}/files")
def get_build_files(build_id: str, x_user_id: Optional[str] = Header(default=None)) -> dict:
    """
    Get generated files for a build (for local preview).
    Returns files from in-memory cache or fetches from S3.
    """
    _require_user(x_user_id)

    # Check local cache first
    if build_id in _BUILD_FILES_CACHE:
        return _BUILD_FILES_CACHE[build_id]

    # Try to fetch from S3 if we have bucket configured
    bucket = _artifacts_bucket()
    if bucket:
        try:
            # List files in the build's files directory
            import boto3
            s3 = boto3.client("s3")
            prefix = f"projects/"

            # Find the project for this build
            # We need to search since we don't have project_id here
            response = s3.list_objects_v2(
                Bucket=bucket,
                Prefix=prefix,
                MaxKeys=1000
            )

            files = []
            patch_diff = ""

            for obj in response.get("Contents", []):
                key = obj["Key"]
                if build_id in key:
                    if key.endswith("patch.diff"):
                        resp = s3.get_object(Bucket=bucket, Key=key)
                        patch_diff = resp["Body"].read().decode("utf-8")
                    elif "/files/" in key:
                        resp = s3.get_object(Bucket=bucket, Key=key)
                        content = resp["Body"].read().decode("utf-8")
                        path = key.split("/files/")[-1]
                        files.append({"path": path, "content": content})

            if files or patch_diff:
                return {"files": files, "patch_diff": patch_diff}

        except Exception as e:
            print(f"[BUILD_FILES] Error fetching from S3: {e}")

    raise HTTPException(status_code=404, detail="No generated files found for this build")


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

    # Persist assistant message so future calls have context even if the client doesn't send history.
    try:
        repo.append_chat_message(user_id, project_id, "assistant", _redact(assistant_content or "Ok."))
    except Exception as exc:
        print(f"[CHAT] failed to persist assistant message: {exc}")

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

                # Upload files manifest (Option A: direct file writes)
                files_manifest = [
                    {"path": fc["path"], "content": fc["content"]}
                    for fc in result.get("files", [])
                ]
                manifest_key = f"projects/{project_id}/builds/{build_id}/files.json"
                _s3_put_text(bucket, manifest_key, json.dumps(files_manifest), "application/json")

                # Also upload individual files for debugging/inspection
                for fc in result.get("files", []):
                    file_key = f"projects/{project_id}/builds/{build_id}/files/{fc['path']}"
                    _s3_put_text(bucket, file_key, fc["content"], "text/plain; charset=utf-8")

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


class AnalyzeBuildRequest(BaseModel):
    """Request for autonomous build analysis."""
    build_id: str = Field(description="Build ID to analyze")
    project_id: str = Field(description="Project ID")
    success: bool = Field(default=False, description="Whether the build succeeded")
    validation_passed: bool = Field(default=False, description="Whether validation passed")
    security_passed: bool = Field(default=True, description="Whether security checks passed")
    validation_errors: list[dict] = Field(default_factory=list)
    security_findings: list[dict] = Field(default_factory=list)
    attempt_count: int = Field(default=1, ge=1)


class AnalyzeBuildResponse(BaseModel):
    """Response from autonomous build analysis."""
    success: bool
    error_patterns: list[str] = Field(default_factory=list)
    security_issues: dict = Field(default_factory=dict)
    improvements: list[dict] = Field(default_factory=list)
    should_retry: bool = False
    retry_strategy: Optional[str] = None
    metrics: dict = Field(default_factory=dict)


# Global learning state cache (in production, use Redis/DynamoDB)
_LEARNING_STATE_CACHE: dict = {}


@app.post("/v1/builds/{build_id}/analyze", response_model=AnalyzeBuildResponse)
def analyze_build(
    build_id: str,
    payload: AnalyzeBuildRequest,
    x_user_id: Optional[str] = Header(default=None),
) -> AnalyzeBuildResponse:
    """
    Analyze a build using the autonomous agent.

    This endpoint:
    1. Analyzes build results to identify patterns
    2. Suggests improvements for future builds
    3. Determines if a retry with improved strategy would help
    4. Updates learning state for continuous improvement
    """
    _require_user(x_user_id)

    from app.agents.autonomous_agent import analyze_and_improve

    # Get previous learning state
    learning_state = _LEARNING_STATE_CACHE.get("global", None)

    result = analyze_and_improve(
        build_result={
            "build_id": build_id,
            "project_id": payload.project_id,
            "success": payload.success,
            "validation_passed": payload.validation_passed,
            "security_passed": payload.security_passed,
            "validation_errors": payload.validation_errors,
            "security_findings": payload.security_findings,
            "attempt_count": payload.attempt_count,
        },
        learning_state=learning_state,
    )

    if result.get("success"):
        # Update global learning state
        _LEARNING_STATE_CACHE["global"] = result.get("learning_state", {})

        analysis = result.get("analysis", {})
        return AnalyzeBuildResponse(
            success=True,
            error_patterns=analysis.get("error_patterns", []),
            security_issues=analysis.get("security_findings_by_category", {}),
            improvements=result.get("improvements", []),
            should_retry=result.get("should_retry", False),
            retry_strategy=result.get("retry_strategy"),
            metrics=result.get("metrics", {}),
        )
    else:
        return AnalyzeBuildResponse(
            success=False,
            improvements=[{"error": result.get("error", "Analysis failed")}],
        )


@app.get("/v1/learning/metrics")
def get_learning_metrics(x_user_id: Optional[str] = Header(default=None)) -> dict:
    """
    Get current learning metrics from the autonomous agent.
    """
    _require_user(x_user_id)

    learning_state = _LEARNING_STATE_CACHE.get("global", {})
    return {
        "metrics": learning_state.get("metrics", {}),
        "common_errors": learning_state.get("error_patterns_seen", {}),
        "successful_patterns": learning_state.get("successful_patterns", []),
        "improvement_suggestions_count": len(learning_state.get("improvement_suggestions", [])),
    }


@app.get("/health")
def health() -> dict:
    return {"ok": True, "version": "0.4", "agents_enabled": _use_agents(), "autonomous_learning": True, "sse_builds": True}


# SSE Streaming Build Endpoint
@app.post("/v1/projects/{project_id}/build-autonomous")
async def build_autonomous_stream(
    project_id: str,
    x_user_id: Optional[str] = Header(default=None),
):
    """
    Start an autonomous build with SSE streaming progress.

    This endpoint:
    1. Attempts to generate code with automatic retry on failures
    2. Analyzes errors and applies improvements between attempts
    3. Streams real-time progress updates via Server-Sent Events
    4. Returns final build result after success or max retries

    Returns SSE stream with progress events.
    """
    user_id = _require_user(x_user_id)
    repo = get_repo()

    project = repo.get_project(user_id, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    from app.agents.autonomous_controller import run_autonomous_build_with_sse
    from app.agents.integration import generate_code_with_agents, process_chat_with_agents

    # NOTE: Spec generation moved inside SSE generator to avoid blocking before stream starts

    # Get skeleton manifest
    bucket = _artifacts_bucket()
    skeleton_manifest = []
    if bucket:
        try:
            skeleton_manifest = _get_skeleton_manifest(bucket)
        except Exception:
            pass

    # Track current build ID for polling (must be defined before poll function)
    current_build_id: str = ""

    # Helper to poll CodeBuild status
    def poll_codebuild_status(codebuild_id: str) -> dict:
        """Poll CodeBuild for build status.

        Note: The buildspec always exits 0, so we also check S3 for actual build result.
        Uses project_id and build_id from the enclosing scope (set by trigger_codebuild).
        """
        nonlocal current_build_id  # Will be set by trigger_codebuild

        if not boto3:
            return {"status": "UNKNOWN", "logs": "boto3 not available"}
        try:
            cb = boto3.client("codebuild")
            response = cb.batch_get_builds(ids=[codebuild_id])
            builds = response.get("builds", [])
            if not builds:
                return {"status": "UNKNOWN", "logs": "Build not found"}

            build = builds[0]
            status = build.get("buildStatus", "UNKNOWN")

            # If CodeBuild says SUCCEEDED, verify the actual Next.js build result
            # by checking if the app/ folder exists in S3
            logs = ""
            if status == "SUCCEEDED" and current_build_id:
                try:
                    # Get the build.log from S3 to check actual compilation result
                    s3 = boto3.client("s3")
                    preview_bucket = os.getenv("FACTORY_PREVIEW_BUCKET", "factory-dev-factory-preview")
                    build_log_key = f"p/{project_id}/{current_build_id}/report/build.log"

                    try:
                        log_obj = s3.get_object(Bucket=preview_bucket, Key=build_log_key)
                        logs = log_obj["Body"].read().decode("utf-8", errors="replace")

                        # Check for actual build failure indicators in the log
                        if any(indicator in logs for indicator in [
                            "Failed to compile",
                            "Build failed because of webpack errors",
                            "error TS",
                            "TypeError:",
                            "SyntaxError:",
                            "Unexpected eof",
                        ]):
                            print(f"[POLL] CodeBuild succeeded but Next.js build failed!")
                            status = "FAILED"  # Override to FAILED

                        # Also check if app/ folder exists
                        app_check = s3.list_objects_v2(
                            Bucket=preview_bucket,
                            Prefix=f"p/{project_id}/{current_build_id}/app/",
                            MaxKeys=1
                        )
                        if app_check.get("KeyCount", 0) == 0:
                            print(f"[POLL] No app/ folder found - build failed")
                            status = "FAILED"
                    except Exception as s3_err:
                        # Build log not uploaded yet or error - keep checking
                        if "NoSuchKey" not in str(s3_err):
                            print(f"[POLL] S3 check error: {s3_err}")
                except Exception as e:
                    print(f"[POLL] Error checking S3 build result: {e}")

            # Get build logs on failure
            if status in ("FAILED", "FAULT", "STOPPED"):
                if not logs:  # Only fetch from CloudWatch if we don't have S3 logs
                    try:
                        logs_info = build.get("logs", {})
                        log_group = logs_info.get("groupName")
                        log_stream = logs_info.get("streamName")
                        if log_group and log_stream:
                            logs_client = boto3.client("logs")
                            log_events = logs_client.get_log_events(
                                logGroupName=log_group,
                                logStreamName=log_stream,
                                limit=100,
                                startFromHead=False,
                            )
                            logs = "\n".join([e.get("message", "") for e in log_events.get("events", [])])
                    except Exception:
                        logs = "Failed to fetch logs"

            return {"status": status, "logs": logs}
        except Exception as e:
            return {"status": "UNKNOWN", "logs": str(e)}

    async def generate_sse():
        """Generate SSE events for the autonomous build."""
        try:
            # First event immediately - keeps connection alive
            yield f"data: {json.dumps({'phase': 'initializing', 'message': 'Starting build...', 'attempt': 0, 'max_attempts': 3})}\n\n"

            # Generate spec if missing - do this INSIDE the stream with heartbeats
            spec_yaml = project.spec_yaml
            if not spec_yaml:
                yield f"data: {json.dumps({'phase': 'initializing', 'message': 'Generating project specification...', 'attempt': 0, 'max_attempts': 3})}\n\n"

                try:
                    # Run spec generation with heartbeat
                    import asyncio
                    heartbeat_s = 8.0  # Keep under ALB timeout
                    spec_task = asyncio.create_task(asyncio.to_thread(
                        lambda: run_async(process_chat_with_agents(
                            project_id=project_id,
                            project_name=project.name,
                            template_id=project.template_id,
                            message="Generate a complete spec for this project and proceed to build.",
                            history=[{"role": "user", "content": f"I want to build: {project.name}"}],
                            user_id=user_id,
                            auto_preview=True,
                            templates_dir=TEMPLATES_DIR,
                            modules_dir=MODULES_DIR,
                        ))
                    ))

                    while not spec_task.done():
                        try:
                            await asyncio.wait_for(asyncio.shield(spec_task), timeout=heartbeat_s)
                        except asyncio.TimeoutError:
                            yield f"data: {json.dumps({'phase': 'initializing', 'message': 'Generating specification... still working', 'attempt': 0, 'max_attempts': 3})}\n\n"
                            continue

                    spec_result = await spec_task
                    if spec_result.get("spec_yaml"):
                        spec_yaml = spec_result["spec_yaml"]
                        project.spec_yaml = spec_yaml
                        project.spec_markdown = spec_result.get("spec_markdown")
                        project.spec_updated_at = now_iso()
                        repo.put_project(user_id, project)
                        yield f"data: {json.dumps({'phase': 'initializing', 'message': 'Specification generated!', 'attempt': 0, 'max_attempts': 3})}\n\n"
                except Exception as e:
                    print(f"[AUTONOMOUS] Failed to auto-generate spec: {e}")
                    yield f"data: {json.dumps({'phase': 'initializing', 'message': f'Spec generation failed, using fallback: {str(e)[:50]}', 'attempt': 0, 'max_attempts': 3})}\n\n"

            # If still no spec, create a minimal one
            if not spec_yaml:
                spec_yaml = f"""goal: Build {project.name}
template: {project.template_id}
features:
  - Core functionality as described
  - Clean, modern UI
  - Error handling
"""
                project.spec_yaml = spec_yaml
                project.spec_updated_at = now_iso()
                repo.put_project(user_id, project)

            # Helper to trigger actual CodeBuild (simplified for SSE)
            def trigger_codebuild(project_id: str, gen_result: dict, user_id: str) -> dict:
                nonlocal current_build_id
                try:
                    # Create build record using repo method
                    _, b = repo.create_build(user_id, project_id, "preview")
                    current_build_id = b.build_id  # Track for polling

                    # Upload artifacts to S3 (upload if we have files OR patch_diff)
                    files_list = gen_result.get("files", [])
                    patch_diff = gen_result.get("patch_diff", "")
                    print(f"[AUTONOMOUS] bucket={bucket}, files_count={len(files_list)}, patch_len={len(patch_diff)}")
                    if bucket and (files_list or patch_diff):
                        # Upload patch diff if present
                        if patch_diff:
                            patch_key = f"projects/{project_id}/builds/{b.build_id}/patch.diff"
                            _s3_put_text(bucket, patch_key, patch_diff, "text/plain; charset=utf-8")

                        # Upload files manifest (always upload if we have files)
                        if files_list:
                            files_manifest = [
                                {"path": fc["path"], "content": fc["content"]}
                                for fc in files_list
                            ]
                            files_key = f"projects/{project_id}/builds/{b.build_id}/files.json"
                            _s3_put_text(bucket, files_key, json.dumps(files_manifest), "application/json")

                        # Upload security report
                        security_report = {
                            "passed": gen_result.get("security_passed", True),
                            "findings": gen_result.get("security_findings", []),
                        }
                        security_key = f"projects/{project_id}/builds/{b.build_id}/security.json"
                        _s3_put_text(bucket, security_key, json.dumps(security_report, indent=2), "application/json")

                    # Trigger CodeBuild
                    cb_project = os.getenv("CODEBUILD_PREVIEW_PROJECT", "").strip()
                    cb_build_id = None
                    if cb_project:
                        template_key = os.getenv("FACTORY_TEMPLATE_KEY", "").strip()
                        # Only pass keys for artifacts that were actually uploaded
                        overrides = {}
                        if template_key:
                            overrides["TEMPLATE_KEY"] = template_key
                        if patch_diff:
                            overrides["PATCH_KEY"] = f"projects/{project_id}/builds/{b.build_id}/patch.diff"
                        if files_list:
                            overrides["FILES_MANIFEST_KEY"] = f"projects/{project_id}/builds/{b.build_id}/files.json"
                        cb_build_id = _start_codebuild(
                            cb_project,
                            project_id,
                            b.build_id,
                            overrides=overrides or None,
                        )
                    if cb_build_id:
                        b.status = "running"
                        b.artifacts = b.artifacts or Build.Artifacts()
                        b.artifacts.provider_build_id = cb_build_id
                        # Use environment-configured preview base URL
                        preview_base = _preview_base_url()
                        if preview_base:
                            b.artifacts.preview_url = f"{preview_base}/p/{project_id}/{b.build_id}/app/index.html"
                            b.artifacts.checks_report_url = f"{preview_base}/p/{project_id}/{b.build_id}/report/index.html"
                        repo.update_build(user_id, b)
                        return {
                            "success": True,
                            "build_id": b.build_id,
                            "codebuild_id": cb_build_id,
                            "poll_fn": poll_codebuild_status,
                        }

                    return {"success": False, "error": "CodeBuild trigger failed"}
                except Exception as e:
                    return {"success": False, "error": str(e)}

            # Run the autonomous build loop
            # Skeleton path for compile validation (npm ci && npm run build)
            skeleton_path = str(TEMPLATES_DIR / project.template_id)
            final_status = None
            async for sse_event in run_autonomous_build_with_sse(
                project_id=project_id,
                spec_yaml=spec_yaml,  # Use the local variable we just generated/retrieved
                generate_code_fn=lambda **kw: run_async(smart_generate_code(
                    project_id=kw.get("project_id"),
                    project_name=project.name,
                    template_id=project.template_id,
                    spec_yaml=kw.get("spec_yaml"),
                    user_id=kw.get("user_id", user_id),
                    skeleton_manifest=skeleton_manifest,
                    templates_dir=TEMPLATES_DIR,
                    modules_dir=MODULES_DIR,
                )),
                trigger_codebuild_fn=trigger_codebuild,
                user_id=user_id,
                max_attempts=3,
                skeleton_path=skeleton_path,  # For compile validation
            ):
                yield sse_event
                # Track final status to update database
                if '"phase": "succeeded"' in sse_event:
                    final_status = "succeeded"
                elif '"phase": "failed"' in sse_event:
                    final_status = "failed"

            # Update build status in database when complete
            if current_build_id and final_status:
                try:
                    build = repo.get_build(user_id, current_build_id)
                    if build:
                        build.status = final_status
                        repo.update_build(user_id, build)
                        print(f"[AUTONOMOUS] Updated build {current_build_id} status to {final_status}")

                        # Also update project's last_build_id so frontend shows it on refresh
                        project_obj = repo.get_project(user_id, project_id)
                        if project_obj:
                            project_obj.last_build_id = current_build_id
                            repo.put_project(user_id, project_obj)
                            print(f"[AUTONOMOUS] Updated project {project_id} last_build_id to {current_build_id}")
                except Exception as e:
                    print(f"[AUTONOMOUS] Failed to update build status: {e}")

        except Exception as e:
            import traceback
            traceback.print_exc()
            error_event = f"data: {json.dumps({'phase': 'failed', 'message': str(e), 'error': True})}\n\n"
            yield error_event

    return StreamingResponse(
        generate_sse(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# Get security report for a build
@app.get("/v1/builds/{build_id}/security")
def get_build_security(
    build_id: str,
    x_user_id: Optional[str] = Header(default=None),
) -> dict:
    """Get security scan results for a build."""
    user_id = _require_user(x_user_id)
    repo = get_repo()

    build = repo.get_build(user_id, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    # Try to fetch from S3
    bucket = os.getenv("ARTIFACT_BUCKET", "")
    if bucket:
        try:
            security_key = f"projects/{build.project_id}/builds/{build_id}/security.json"
            s3 = boto3.client("s3") if boto3 else None
            if s3:
                response = s3.get_object(Bucket=bucket, Key=security_key)
                return json.loads(response["Body"].read().decode("utf-8"))
        except Exception:
            pass

    # Return default if not found
    return {
        "passed": True,
        "findings": [],
        "summary": "No security report available",
    }


ORCH_ROOT = Path(__file__).resolve().parents[1]
FACTORY_DIR = ORCH_ROOT / "factory"
TEMPLATES_DIR = FACTORY_DIR / "templates"
MODULES_DIR = FACTORY_DIR / "modules"
_TEMPLATE_CACHE: dict[str, dict] = {}
_MODULE_CACHE: dict[str, dict] = {}
