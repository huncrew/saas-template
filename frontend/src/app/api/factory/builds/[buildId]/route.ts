import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../../_util";
import { mockStore } from "../../_mock";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ buildId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const { buildId } = await params;

  const base = orchestratorBaseUrl();
  if (!base) {
    const b = mockStore.builds.get(buildId);
    if (!b) return jsonErr("Not found", 404);
    return jsonOk(b);
  }

  const res = await fetch(`${base}/v1/builds/${encodeURIComponent(buildId)}`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) return jsonErr(body?.detail || body?.error || "Not found", res.status);
  return jsonOk(body);
}


