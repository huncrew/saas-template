import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export async function POST(request: NextRequest) {
  try {
    const devNoAuth = process.env.FACTORY_DEV_NO_AUTH === "1";
    const userId = devNoAuth ? "dev_user" : (await auth()).userId;
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { prompt, message, model, temperature, maxTokens } = body;
    const normalizedPrompt = (prompt || message || "").toString();

    if (!normalizedPrompt) {
      return NextResponse.json(
        { success: false, error: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Call the backend Lambda function
    const backendUrl =
      process.env.BACKEND_API_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL;
    if (!backendUrl) {
      // For local dev we want the UI to "just work" even if AWS isn't configured yet.
      // This returns a deterministic mock response so chat UI is usable offline.
      if (devNoAuth) {
        const debug = {
          BACKEND_API_URL: process.env.BACKEND_API_URL ? "set" : "missing",
          NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ? "set" : "missing",
          NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ? "set" : "missing",
          ORCHESTRATOR_API_URL: process.env.ORCHESTRATOR_API_URL ? "set" : "missing",
          NODE_ENV: process.env.NODE_ENV || "unknown",
        };
        return NextResponse.json(
          {
            success: true,
            data: {
              response:
                "Dev mode: backend URL isn’t configured, so this is a mock response.\n\nTo enable real AI calls, start the frontend with:\nBACKEND_API_URL=https://{api_id}.execute-api.{region}.amazonaws.com/{stage}\n\nDebug:\n" +
                JSON.stringify(debug, null, 2),
              model: "local-mock",
              tokens: 0,
              requestId: "dev-mock",
            },
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error:
            'Backend API URL not configured. Set BACKEND_API_URL (recommended) or NEXT_PUBLIC_API_BASE_URL to your API Gateway base URL (e.g. https://{api_id}.execute-api.{region}.amazonaws.com/{stage}).',
        },
        { status: 500 }
      );
    }

    const response = await fetch(`${backendUrl}/ai/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId,
        prompt: normalizedPrompt,
        model: model || 'anthropic.claude-3-haiku-20240307-v1:0',
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 1000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const retryAfter = response.headers.get("retry-after") || undefined;
      const errorMessage =
        errorData?.error ||
        errorData?.message ||
        errorData?.detail ||
        'Failed to generate AI response';

      // Helpful, non-sensitive debugging to locate throttling source in dev.
      const debug = devNoAuth
        ? (() => {
            const headersObj = Object.fromEntries(response.headers.entries());
            const dbg = {
              upstreamStatus: response.status,
              upstreamRequestId:
                headersObj["x-amzn-requestid"] ||
                headersObj["x-amz-request-id"] ||
                undefined,
              upstreamErrorType: headersObj["x-amzn-errortype"] || undefined,
              upstreamVia: headersObj["via"] || undefined,
              upstreamXCache: headersObj["x-cache"] || undefined,
              retryAfter,
              upstreamHeaders: headersObj,
              upstreamBody: errorData,
            };
            // Log server-side too so you can see it in the Next dev console.
            // (Dev-only to avoid leaking headers in prod logs.)
            console.error("AI upstream error", dbg);
            return dbg;
          })()
        : undefined;
      return NextResponse.json(
        { success: false, error: errorMessage, retryAfter, debug },
        { status: response.status, headers: retryAfter ? { "Retry-After": retryAfter } : undefined }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('AI generate API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
