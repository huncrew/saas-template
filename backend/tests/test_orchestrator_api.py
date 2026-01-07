import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Make orchestrator importable
sys.path.append(str(Path(__file__).resolve().parents[1] / "orchestrator"))

from app.main import app  # noqa: E402
from app.store import STORE  # noqa: E402


@pytest.fixture(autouse=True)
def reset_store():
    STORE.reset()
    yield
    STORE.reset()


@pytest.fixture()
def client():
    return TestClient(app)


def auth_headers(user_id: str = "user_1"):
    return {"X-User-Id": user_id}


def test_projects_create_and_list(client: TestClient):
    r = client.get("/v1/projects", headers=auth_headers())
    assert r.status_code == 200
    assert r.json() == []

    r = client.post("/v1/projects", headers=auth_headers(), json={"name": "My App", "template_id": "saas-crud"})
    assert r.status_code == 200
    project = r.json()
    assert project["name"] == "My App"
    assert project["template_id"] == "saas-crud"
    assert project["project_id"].startswith("proj_")

    r = client.get("/v1/projects", headers=auth_headers())
    assert r.status_code == 200
    projects = r.json()
    assert len(projects) == 1
    assert projects[0]["project_id"] == project["project_id"]


def test_build_preview_sets_last_build_and_can_poll_build(client: TestClient, monkeypatch):
    # speed up build simulation
    from app import main as main_mod  # noqa: E402

    def fast_sim(repo, user_id: str, build_id: str):
        b = repo.get_build(user_id, build_id)
        b.status = "succeeded"
        b.started_at = "now"
        b.finished_at = "now"
        if b.artifacts:
            b.artifacts.preview_url = f"http://example/p/{b.project_id}/{b.build_id}/index.html"
        repo.update_build(user_id, b)

    monkeypatch.setattr(main_mod, "_simulate_build", fast_sim)

    r = client.post("/v1/projects", headers=auth_headers(), json={"name": "X", "template_id": "saas-crud"})
    project_id = r.json()["project_id"]

    r = client.post(f"/v1/projects/{project_id}/build-preview", headers=auth_headers())
    assert r.status_code == 200
    build = r.json()
    assert build["build_id"].startswith("build_")

    # project should point at last_build_id
    r = client.get(f"/v1/projects/{project_id}", headers=auth_headers())
    assert r.status_code == 200
    assert r.json()["last_build_id"] == build["build_id"]

    # poll build
    r = client.get(f"/v1/builds/{build['build_id']}", headers=auth_headers())
    assert r.status_code == 200
    got = r.json()
    assert got["status"] == "succeeded"
    assert got["type"] == "preview"


def test_preview_url_base_is_used_when_set(client: TestClient, monkeypatch):
    monkeypatch.setenv("FACTORY_PREVIEW_BASE_URL", "https://preview.example")

    # speed up build simulation
    from app import main as main_mod  # noqa: E402

    def fast_sim(repo, user_id: str, build_id: str):
        b = repo.get_build(user_id, build_id)
        b.status = "succeeded"
        b.started_at = "now"
        b.finished_at = "now"
        repo.update_build(user_id, b)

    monkeypatch.setattr(main_mod, "_simulate_build", fast_sim)

    r = client.post("/v1/projects", headers=auth_headers(), json={"name": "X", "template_id": "saas-crud"})
    project_id = r.json()["project_id"]

    r = client.post(f"/v1/projects/{project_id}/build-preview", headers=auth_headers())
    assert r.status_code == 200
    build = r.json()
    assert build["artifacts"]["preview_url"].startswith("https://preview.example/p/")


def test_missing_user_header_is_unauthorized(client: TestClient):
    r = client.get("/v1/projects")
    assert r.status_code == 401



