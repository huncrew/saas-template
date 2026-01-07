import { NextRequest } from "next/server";
import type { FactoryProject } from "@/types/factory";
import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../_util";
import { mockStore, newId, nowIso } from "../_mock";

function mockProject(name: string): FactoryProject {
  return {
    project_id: newId("proj"),
    name,
    template_id: "saas-crud",
    created_at: nowIso(),
    status: "active",
  };
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const base = orchestratorBaseUrl();
  if (!base) return jsonOk(mockStore.projects);

  const res = await fetch(`${base}/v1/projects`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) return jsonErr(body?.detail || body?.error || "Failed to list projects", res.status);
  return jsonOk(body as FactoryProject[]);
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const payload = (await req.json()) as { name?: string; template_id?: string };
  const name = (payload.name || "").trim();
  const templateId = payload.template_id || "saas-crud";
  if (!name) return jsonErr("Name is required", 400);

  const base = orchestratorBaseUrl();
  if (!base) {
    const p = mockProject(name);
    mockStore.projects = [p, ...mockStore.projects];
    return jsonOk(p);
  }

  const res = await fetch(`${base}/v1/projects`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    body: JSON.stringify({ name, template_id: templateId }),
  });
  const body = await res.json();
  if (!res.ok) return jsonErr(body?.error || "Create project failed", res.status);
  return jsonOk(body);
}


