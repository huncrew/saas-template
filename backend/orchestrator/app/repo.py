from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

from .models import ChatRole

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

    @abstractmethod
    def append_chat_message(self, user_id: str, project_id: str, role: ChatRole, content: str) -> None: ...

    @abstractmethod
    def list_chat_messages(self, user_id: str, project_id: str, limit: int = 50) -> list[dict]: ...


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

    def append_chat_message(self, user_id: str, project_id: str, role: ChatRole, content: str) -> None:
        STORE.append_chat_message(user_id, project_id, role, content)

    def list_chat_messages(self, user_id: str, project_id: str, limit: int = 50) -> list[dict]:
        return STORE.list_chat_messages(user_id, project_id, limit=limit)


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
        chats_table = os.getenv("FACTORY_CHATS_TABLE", "").strip()
        if not projects_table or not builds_table or not chats_table:
            raise RuntimeError("Missing FACTORY_PROJECTS_TABLE / FACTORY_BUILDS_TABLE / FACTORY_CHATS_TABLE env vars")

        dynamodb = boto3.resource("dynamodb")
        self.projects = dynamodb.Table(projects_table)
        self.builds = dynamodb.Table(builds_table)
        self.chats = dynamodb.Table(chats_table)

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

    @staticmethod
    def _c_pk(user_id: str, project_id: str) -> str:
        return f"USER#{user_id}#PROJ#{project_id}"

    @staticmethod
    def _c_sk(created_at: str, msg_id: str) -> str:
        return f"TS#{created_at}#{msg_id}"

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

    def append_chat_message(self, user_id: str, project_id: str, role: ChatRole, content: str) -> None:
        import uuid
        msg_id = f"msg_{uuid.uuid4().hex[:12]}"
        created_at = now_iso()
        ttl_seconds = int(os.getenv("FACTORY_CHATS_TTL_SECONDS", "2592000"))  # 30 days default
        # Convert ISO to epoch-ish is annoying; store ttl as now+ttl (seconds since epoch).
        # We can approximate using datetime parsing without adding deps by using pydantic/dateutil; keep simple:
        import datetime
        dt = datetime.datetime.now(datetime.timezone.utc)
        ttl = int(dt.timestamp()) + ttl_seconds
        item = {
            "pk": self._c_pk(user_id, project_id),
            "sk": self._c_sk(created_at, msg_id),
            "message_id": msg_id,
            "project_id": project_id,
            "role": role,
            "content": content,
            "created_at": created_at,
            "ttl": ttl,
        }
        self.chats.put_item(Item=item)

    def list_chat_messages(self, user_id: str, project_id: str, limit: int = 50) -> list[dict]:
        resp = self.chats.query(
            KeyConditionExpression="pk = :pk AND begins_with(sk, :prefix)",
            ExpressionAttributeValues={":pk": self._c_pk(user_id, project_id), ":prefix": "TS#"},
            Limit=max(1, min(int(limit), 200)),
            ScanIndexForward=False,
        )
        items = resp.get("Items") or []
        # Return oldest->newest for prompt readability
        items.sort(key=lambda i: i.get("sk", ""))
        return [
            {
                "message_id": i.get("message_id"),
                "role": i.get("role"),
                "content": i.get("content"),
                "created_at": i.get("created_at"),
            }
            for i in items
        ]


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






