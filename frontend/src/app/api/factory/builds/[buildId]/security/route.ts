import { NextRequest } from "next/server";
import { jsonErr, jsonOk, orchestratorBaseUrl, getUserId } from "../../../_util";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ buildId: string }> }
) {
  const { buildId } = await context.params;
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const base = orchestratorBaseUrl();
  if (!base) {
    // Return mock data
    return jsonOk({
      passed: true,
      findings: [],
      summary: "No security report available (mock mode)",
    });
  }

  try {
    const res = await fetch(`${base}/v1/builds/${encodeURIComponent(buildId)}/security`, {
      method: "GET",
      headers: { "X-User-Id": userId },
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonErr(text || "Failed to get security report", res.status);
    }

    const data = await res.json();
    return jsonOk(data);
  } catch (e) {
    console.error("Security fetch error:", e);
    return jsonErr((e as Error).message || "Failed to fetch security report", 500);
  }
}
