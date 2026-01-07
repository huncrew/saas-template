from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

try:
    import boto3  # type: ignore
except Exception:  # pragma: no cover
    boto3 = None

from .models import Build, BuildArtifacts, BuildType, Project, now_iso
from .store import STORE


class Repo(ABC):
    @abstractmethod
    def list_projects(self, user_id: str) -> List[Project]: ...

    @abstractmethod
    def create_project(self, user_id: str, name: str, template_id: str) -> Project: ...

    @abstractmethod
    def get_project(self, user_id: str, project_id: str) -> Optional[Project]: ...

    @abstractmethod
    def put_project(self, user_id: str, project: Project) -> None: ...

    @abstractmethod
    def create_build(self, user_id: str, project_id: str, build_type: BuildType) -> Tuple[Optional[Project], Build]: ...

    @abstractmethod
    def get_build(self, user_id: str, build_id: str) -> Optional[Build]: ...

    @abstractmethod
    def update_build(self, user_id: str, build: Build) -> None: ...


class InMemoryRepo(Repo):
    def list_projects(self, user_id: str) -> List[Project]:
        return STORE.list_projects(user_id)

    def create_project(self, user_id: str, name: str, template_id: str) -> Project:
        return STORE.create_project(user_id, name, template_id)

    def get_project(self, user_id: str, project_id: str) -> Optional[Project]:
        return STORE.get_project(user_id, project_id)

    def put_project(self, user_id: str, project: Project) -> None:
        STORE.put_project(user_id, project)

    def create_build(self, user_id: str, project_id: str, build_type: BuildType):
        return STORE.create_build(user_id, project_id, build_type)

    def get_build(self, user_id: str, build_id: str) -> Optional[Build]:
        return STORE.get_build(user_id, build_id)

    def update_build(self, user_id: str, build: Build) -> None:
        STORE.update_build(user_id, build)


class DynamoRepo(Repo):
    """
    Minimal DynamoDB repo.

    Tables:
    - FACTORY_PROJECTS_TABLE: pk, sk (string)
    - FACTORY_BUILDS_TABLE:   pk, sk (string)

    Keys:
    - projects: pk=USER#{user_id}, sk=PROJ#{project_id}
    - builds:   pk=USER#{user_id}, sk=BUILD#{build_id}
    """

    def __init__(self):
        if not boto3:
            raise RuntimeError("boto3 not available")
        projects_table = os.getenv("FACTORY_PROJECTS_TABLE", "").strip()
        builds_table = os.getenv("FACTORY_BUILDS_TABLE", "").strip()
        if not projects_table or not builds_table:
            raise RuntimeError("Missing FACTORY_PROJECTS_TABLE / FACTORY_BUILDS_TABLE env vars")

        dynamodb = boto3.resource("dynamodb")
        self.projects = dynamodb.Table(projects_table)
        self.builds = dynamodb.Table(builds_table)

    @staticmethod
    def _p_pk(user_id: str) -> str:
        return f"USER#{user_id}"

    @staticmethod
    def _p_sk(project_id: str) -> str:
        return f"PROJ#{project_id}"

    @staticmethod
    def _b_pk(user_id: str) -> str:
        return f"USER#{user_id}"

    @staticmethod
    def _b_sk(build_id: str) -> str:
        return f"BUILD#{build_id}"

    def list_projects(self, user_id: str) -> List[Project]:
        resp = self.projects.query(
            KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={":pk": self._p_pk(user_id), ":prefix": "PROJ#"},
        )
        items = resp.get("Items") or []
        projects = [Project(**{k: v for k, v in i.items() if k not in {"pk", "sk"}}) for i in items]
        projects.sort(key=lambda p: p.created_at, reverse=True)
        return projects

    def create_project(self, user_id: str, name: str, template_id: str) -> Project:
        # Generate ID using in-memory store helper to keep format stable
        p = STORE.create_project(user_id, name, template_id)
        item = {"pk": self._p_pk(user_id), "sk": self._p_sk(p.project_id), **p.model_dump()}
        self.projects.put_item(Item=item)
        return p

    def get_project(self, user_id: str, project_id: str) -> Optional[Project]:
        resp = self.projects.get_item(Key={"pk": self._p_pk(user_id), "sk": self._p_sk(project_id)})
        item = resp.get("Item")
        if not item:
            return None
        return Project(**{k: v for k, v in item.items() if k not in {"pk", "sk"}})

    def put_project(self, user_id: str, project: Project) -> None:
        item = {"pk": self._p_pk(user_id), "sk": self._p_sk(project.project_id), **project.model_dump()}
        self.projects.put_item(Item=item)

    def create_build(self, user_id: str, project_id: str, build_type: BuildType) -> Tuple[Optional[Project], Build]:
        project = self.get_project(user_id, project_id)
        _, b = STORE.create_build(user_id, project_id, build_type)
        b.artifacts = b.artifacts or BuildArtifacts()
        item = {"pk": self._b_pk(user_id), "sk": self._b_sk(b.build_id), **b.model_dump()}
        self.builds.put_item(Item=item)
        return project, b

    def get_build(self, user_id: str, build_id: str) -> Optional[Build]:
        resp = self.builds.get_item(Key={"pk": self._b_pk(user_id), "sk": self._b_sk(build_id)})
        item = resp.get("Item")
        if not item:
            return None
        return Build(**{k: v for k, v in item.items() if k not in {"pk", "sk"}})

    def update_build(self, user_id: str, build: Build) -> None:
        item = {"pk": self._b_pk(user_id), "sk": self._b_sk(build.build_id), **build.model_dump()}
        self.builds.put_item(Item=item)


def get_repo() -> Repo:
    mode = os.getenv("FACTORY_REPO_MODE", "").strip().lower()
    if mode == "dynamo":
        return DynamoRepo()

    # auto: if tables are present, use Dynamo
    if os.getenv("FACTORY_PROJECTS_TABLE") and os.getenv("FACTORY_BUILDS_TABLE"):
        try:
            return DynamoRepo()
        except Exception:
            return InMemoryRepo()

    return InMemoryRepo()





