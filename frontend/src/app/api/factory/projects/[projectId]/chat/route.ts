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
      "Plan:\n- Confirm template scope (V1: saas-crud)\n- Generate/validate a change spec\n- Run tests + build\n- Publish a hosted preview URL\n";
    return jsonOk({
      assistant: {
        role: "assistant",
        content: wantsBuild ? `Got it — starting a preview build.\n\n${plan}` : "Before we build, a couple quick questions:",
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
        "Plan:\n- Confirm template scope (V1: saas-crud)\n- Generate/validate a change spec\n- Run tests + build\n- Publish a hosted preview URL\n";
      return jsonOk({
        assistant: {
          role: "assistant",
          content: wantsBuild ? `Got it — starting a preview build.\n\n${plan}` : "Before we build, a couple quick questions:",
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


