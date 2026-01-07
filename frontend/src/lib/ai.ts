import { APIResponse } from '@/types';

export interface AIRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  response: string;
  model: string;
  tokens: number;
  requestId: string;
}

export interface AISession {
  id: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  createdAt: string;
}

class AIService {
  private isRetryableErr(e: unknown): e is Error & { status?: number; retryAfterSec?: number } {
    if (!e || typeof e !== "object") return false;
    return "status" in e || "retryAfterSec" in e;
  }

  async generateResponse(request: AIRequest, userId?: string): Promise<APIResponse<AIResponse>> {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const requestOnce = async () => {
      // Always call the Next.js route with an absolute path.
      // If you call a relative path like `ai/generate` from `/projects/:id`,
      // the browser will resolve it as `/projects/:id/ai/generate` (404).
      const response = await fetch(`/api/ai/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...request, userId }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message = data?.error || data?.message || response.statusText || 'AI request failed';
        const err = new Error(message) as Error & { status?: number; retryAfterSec?: number };
        err.status = response.status;
        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfterBody = Number(data?.retryAfter);
        const retryAfterSec =
          Number.isFinite(retryAfterBody) ? retryAfterBody : retryAfterHeader ? Number(retryAfterHeader) : undefined;
        if (retryAfterSec && Number.isFinite(retryAfterSec)) err.retryAfterSec = retryAfterSec;
        throw err;
      }

      return data as APIResponse<AIResponse>;
    };

    try {
      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await requestOnce();
        } catch (e: unknown) {
          const status = this.isRetryableErr(e) ? e.status : undefined;
          const retryAfterSec = this.isRetryableErr(e) ? e.retryAfterSec : undefined;
          if (status === 429 && attempt < maxAttempts) {
            const retryAfterMs = (retryAfterSec ? retryAfterSec * 1000 : 0) || 0;
            const backoffMs = 600 * Math.pow(2, attempt - 1); // 600ms, 1200ms, ...
            await delay(Math.max(retryAfterMs, backoffMs));
            continue;
          }
          throw e;
        }
      }
      // should never hit
      throw new Error("AI request failed");
    } catch (error) {
      console.error('AI service error:', error);
      throw error;
    }
  }

  async getHistory(): Promise<APIResponse<AISession[]>> {
    try {
      throw new Error("AI history route not implemented");
    } catch (error) {
      console.error('AI history service error:', error);
      throw error;
    }
  }
}

export const aiService = new AIService();
