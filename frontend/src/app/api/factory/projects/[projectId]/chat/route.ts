import { getUserId, jsonErr, jsonOk, orchestratorBaseUrl } from "../../../_util";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = await getUserId();
  if (!userId) return jsonErr("Unauthorized", 401);

  const { projectId } = await params;
  const base = orchestratorBaseUrl();
  const body = await req.json().catch(() => ({}));

  // If orchestrator isn't configured, fall back to a deterministic local planner response.
  console.log("🔍 Orchestrator base URL:", base);
  if (!base) {
    const msg = String(body?.message || "").trim();
    if (!msg) return jsonErr("message is required", 400);
    const lower = msg.toLowerCase();
    const wantsBuild =
      Boolean(body?.auto_preview) || /build\s+preview|preview|deploy|ship|run\s+build/.test(lower);
    const followups = wantsBuild
      ? []
      : [
          "What’s the primary user and core workflow for this app?",
          "Any required integrations (auth, Stripe, email) for V1?",
          "Should we prioritize speed (minimal) or completeness (roles, audit log, admin)?",
        ];
    const plan =
      "Plan:\n- Turn chat into a spec\n- Generate a patch\n- Run preview build\n- Publish preview URL\n";
    return jsonOk({
      assistant: {
        role: "assistant",
        content: wantsBuild ? `Perfect! Let's build a preview.` : `Got it! I'll help you build that. Let me ask a few questions first:`,
      },
      followups,
      suggested_action: wantsBuild ? "build_preview" : "ask_followups",
      plan: wantsBuild ? plan : null,
    });
  }

  const res = await fetch(`${base}/v1/projects/${encodeURIComponent(projectId)}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": userId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  // Deployed orchestrator may not yet have the /chat endpoint; fall back rather than hard-fail.
  if (!res.ok) {
    if (res.status === 404) {
      const msg = String(body?.message || "").trim();
      const lower = msg.toLowerCase();
      const wantsBuild =
        Boolean(body?.auto_preview) || /build\s+preview|preview|deploy|ship|run\s+build/.test(lower);
      const followups = wantsBuild
        ? []
        : [
            "What’s the primary user and core workflow for this app?",
            "Any required integrations (auth, Stripe, email) for V1?",
            "Should we prioritize speed (minimal) or completeness (roles, audit log, admin)?",
          ];
      const plan =
        "Plan:\n- Turn chat into a spec\n- Generate a patch\n- Run preview build\n- Publish preview URL\n";
      return jsonOk({
        assistant: {
          role: "assistant", 
          content: wantsBuild ? `Perfect! Let's build a preview.` : `Got it! I'll help you build that. Let me ask a few questions first:`,
        },
        followups,
        suggested_action: wantsBuild ? "build_preview" : "ask_followups",
        plan: wantsBuild ? plan : null,
      });
    }
    return jsonErr(data?.detail || data?.error || "Chat failed", res.status);
  }
  return jsonOk(data);
}


