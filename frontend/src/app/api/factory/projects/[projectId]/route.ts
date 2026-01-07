import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../../_util";
import { mockStore } from "../../_mock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const { projectId } = await params;
  const base = orchestratorBaseUrl();
  if (!base) {
    const project = mockStore.projects.find((p) => p.project_id === projectId);
    if (!project) return jsonErr("Not found", 404);
    return jsonOk(project);
  }

  const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) {
    if (res.status === 404) {
      return jsonErr(
        "Project not found in orchestrator. You likely created this project while ORCHESTRATOR_API_URL was unset (mock mode). Create a new project from /projects.",
        404
      );
    }
    return jsonErr(body?.detail || body?.error || "Not found", res.status);
  }
  return jsonOk(body);
}


