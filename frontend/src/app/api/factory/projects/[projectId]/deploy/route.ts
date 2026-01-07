import type { FactoryBuild } from "@/types/factory";
import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../../../_util";
import { mockStore, newId, nowIso } from "../../../_mock";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const { projectId } = await params;

  const base = orchestratorBaseUrl();
  if (!base) {
    return jsonErr("ORCHESTRATOR_API_URL not configured (cannot run real deploy build)", 500);
  }

  const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/deploy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
  });
  const body = await res.json();
  if (!res.ok) return jsonErr(body?.detail || body?.error || "Failed to start deploy", res.status);
  return jsonOk(body);
}


