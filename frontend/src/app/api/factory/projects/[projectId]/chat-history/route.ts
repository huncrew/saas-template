import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../../../_util";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const { projectId } = await params;
  const base = orchestratorBaseUrl();

  if (!base) {
    // Mock mode - return empty history
    return jsonOk({
      project_id: projectId,
      messages: [],
    });
  }

  const url = new URL(req.url);
  const limit = url.searchParams.get("limit") || "50";

  const res = await fetch(
    `${base}/v1/projects/${encodeURIComponent(projectId)}/chat-history?limit=${encodeURIComponent(limit)}`,
    {
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      cache: "no-store",
    }
  );

  const body = await res.json();
  if (!res.ok) {
    if (res.status === 404) return jsonErr("Project not found", 404);
    return jsonErr(body?.detail || body?.error || "Failed to fetch chat history", res.status);
  }

  return jsonOk(body);
}


