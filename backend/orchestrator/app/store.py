from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from .models import Build, BuildArtifacts, BuildStatus, BuildType, Project, now_iso


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


@dataclass
class InMemoryStore:
    # keyed by user_id
    projects: Dict[str, Dict[str, Project]] = field(default_factory=dict)
    builds: Dict[str, Dict[str, Build]] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    def list_projects(self, user_id: str) -> List[Project]:
        with self.lock:
            items = list(self.projects.get(user_id, {}).values())
        items.sort(key=lambda p: p.created_at, reverse=True)
        return items

    def create_project(self, user_id: str, name: str, template_id: str) -> Project:
        p = Project(
            project_id=_new_id("proj"),
            name=name,
            template_id=template_id,
            created_at=now_iso(),
            last_build_id=None,
            status="active",
        )
        with self.lock:
            self.projects.setdefault(user_id, {})[p.project_id] = p
        return p

    def get_project(self, user_id: str, project_id: str) -> Optional[Project]:
        with self.lock:
            return self.projects.get(user_id, {}).get(project_id)

    def put_project(self, user_id: str, project: Project) -> None:
        with self.lock:
            self.projects.setdefault(user_id, {})[project.project_id] = project

    def create_build(
        self, user_id: str, project_id: str, build_type: BuildType
    ) -> Tuple[Optional[Project], Build]:
        project = self.get_project(user_id, project_id)
        b = Build(
            build_id=_new_id("build"),
            project_id=project_id,
            type=build_type,
            status="queued",
            started_at=None,
            finished_at=None,
            artifacts=BuildArtifacts(),
            error=None,
        )
        with self.lock:
            self.builds.setdefault(user_id, {})[b.build_id] = b
        return project, b

    def get_build(self, user_id: str, build_id: str) -> Optional[Build]:
        with self.lock:
            return self.builds.get(user_id, {}).get(build_id)

    def update_build(self, user_id: str, build: Build) -> None:
        with self.lock:
            self.builds.setdefault(user_id, {})[build.build_id] = build

    def reset(self) -> None:
        with self.lock:
            self.projects.clear()
            self.builds.clear()


STORE = InMemoryStore()


