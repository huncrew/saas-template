import { NextRequest, NextResponse } from "next/server";
import { jsonErr, orchestratorBaseUrl, getUserId } from "../../../_util";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await context.params;
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const base = orchestratorBaseUrl();
  if (!base) {
    return jsonErr("ORCHESTRATOR_API_URL not configured (cannot run autonomous build)", 500);
  }

  try {
    const bodyText = await req.text().catch(() => "");
    // Forward the request to the orchestrator
    const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/build-autonomous`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": userId,
      },
      body: bodyText && bodyText.trim().length ? bodyText : JSON.stringify({}),
    });

    if (!res.ok) {
      const text = await res.text();
      return jsonErr(text || "Failed to start autonomous build", res.status);
    }

    // Stream the SSE response directly
    const body = res.body;
    if (!body) {
      return jsonErr("No response body from orchestrator", 500);
    }

    // Create a new ReadableStream that forwards the orchestrator's stream
    const stream = new ReadableStream({
      async start(controller) {
        const reader = body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }
        } finally {
          controller.close();
          reader.releaseLock();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    console.error("Autonomous build error:", e);
    return jsonErr((e as Error).message || "Failed to start autonomous build", 500);
  }
}
