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
    // When you want real builds, the orchestrator must be configured.
    // Returning a mock build here makes "Build Preview" feel broken (no preview URL).
    return jsonErr("ORCHESTRATOR_API_URL not configured (cannot run real preview build)", 500);

  }

  const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/build-preview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 404) {
      return jsonErr(
        "Project not found in orchestrator. You likely created this project while ORCHESTRATOR_API_URL was unset (mock mode). Create a new project from /projects and try again.",
        404
      );
    }
    return jsonErr(body?.detail || body?.error || "Failed to start build", res.status);
  }
  return jsonOk(body);
}


