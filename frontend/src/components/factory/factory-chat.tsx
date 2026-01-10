"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { factoryApi } from "@/lib/factory-api";
import type { FactoryBuild, FactoryChatMessage, FactoryProjectChatResponse } from "@/types/factory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Check, Loader2, Play, Send, Sparkles, User } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

type PersistedChatMessage = {
  message_id?: string;
  role?: "user" | "assistant";
  content?: string;
  created_at?: string;
};

function normalizeRole(role: unknown): Message["role"] {
  return role === "assistant" ? "assistant" : "user";
}

const SUGGESTIONS = [
  "Create a SaaS CRUD app with teams and roles",
  "Add an audit log and admin panel",
  "Add Stripe billing (stub) and usage limits",
];

export function FactoryChat({
  projectId,
  onPreviewBuildStarted,
  onAutonomousBuildRequested,
}: {
  projectId: string;
  onPreviewBuildStarted?: (b: FactoryBuild) => void;
  /**
   * Preferred (new) path: let the parent trigger the autonomous build flow
   * so SSE progress + build state are handled in one place.
   */
  onAutonomousBuildRequested?: (buildMode?: "ui_only" | "backend" | "auth") => void | Promise<void>;
}) {
  const { user, isLoaded } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoPreview, setAutoPreview] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [pending, setPending] = useState<FactoryProjectChatResponse | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);
  const followups = pending?.followups || [];
  const hasFollowups = followups.length > 0;
  const readyForBuild = pending?.suggested_action === "build_preview" && !hasFollowups;

  const canShowBuildActions = !!onAutonomousBuildRequested && (messages.length > 0 || !!pending);

  async function requestAutonomousBuild(mode: "ui_only" | "backend" | "auth") {
    if (!onAutonomousBuildRequested) return;
    await onAutonomousBuildRequested(mode);
  }

  // Hydrate chat from persisted backend history on first load.
  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      try {
        const res = await fetch(`/api/factory/projects/${projectId}/chat-history?limit=80`, {
          cache: "no-store",
        });
        const j = await res.json();
        const body = j?.data;
        const msgs = body?.messages;
        if (!res.ok || !Array.isArray(msgs)) return;

        const hydrated: Message[] = (msgs as PersistedChatMessage[])
          .map((m) => ({
            id: String(m?.message_id || `m_${Math.random().toString(16).slice(2)}`),
            role: normalizeRole(m?.role),
            content: String(m?.content || ""),
            createdAt: m?.created_at ? Date.parse(m.created_at) : Date.now(),
          }))
          .filter((m) => m.content.trim().length > 0);

        if (!cancelled) {
          setMessages(hydrated);
        }
      } catch (e) {
        // Non-fatal: chat can still work without history hydration.
        console.error("Failed to load chat history:", e);
      }
    }

    // Only hydrate when we first mount / projectId changes.
    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function startPreviewBuild(autoTrigger = false) {
    if (isBuilding) return false;
    setIsBuilding(true);
    try {
      // Prefer the autonomous build flow if parent provided it.
      if (onAutonomousBuildRequested) {
        await requestAutonomousBuild("ui_only");
        toast.success(autoTrigger ? "Preview build started automatically" : "Preview build started");
        return true;
      }

      const res = await factoryApi.createPreviewBuild(projectId);
      if (res.data) {
        onPreviewBuildStarted?.(res.data);
        toast.success(autoTrigger ? "Preview build started automatically" : "Preview build started");
        return true;
      }
      throw new Error("Build response missing");
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error && e.message ? e.message : "Failed to start preview build";
      toast.error(msg);
      return false;
    } finally {
      setIsBuilding(false);
    }
  }

  async function send(prompt: string) {
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      content: prompt.trim(),
      createdAt: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPending(null);

    try {
      const historyPayload: FactoryChatMessage[] = [...messages, userMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const res = await factoryApi.chatProject(projectId, {
        message: prompt.trim(),
        auto_preview: autoPreview,
        history: historyPayload,
      });
      const data = res.data;
      if (!data) throw new Error("Chat failed");

      const aiMsg: Message = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.assistant?.content?.trim() || "Ok.",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setPending(data);

      const readyForAutoBuild = autoPreview && data.suggested_action === "build_preview" && !(data.followups?.length);
      if (readyForAutoBuild) {
        await startPreviewBuild(true);
      }

      queueMicrotask(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
      });
    } catch (e: unknown) {
      console.error(e);
      const msg = e instanceof Error && e.message ? e.message : "Failed to get AI response";
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-white">
      {/* Messages area */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 sm:py-4 bg-gradient-to-b from-gray-50/30 to-white min-h-0">
        {messages.length === 0 ? (
          <div className="pt-2 sm:pt-4">
            <div className="rounded-xl sm:rounded-2xl border border-gray-200 bg-white p-3 sm:p-5 shadow-sm">
              <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm sm:text-base font-semibold text-gray-900">What are we building?</div>
                  <div className="text-xs sm:text-sm text-gray-500">Describe your app idea</div>
                </div>
              </div>
              <div className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                Tell me what you want to build. I&apos;ll create a plan and we can refine it together.
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="text-[10px] sm:text-xs font-medium text-gray-500 uppercase tracking-wide">Try an example</div>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="w-full text-left text-xs sm:text-sm rounded-lg sm:rounded-xl border border-gray-200 bg-gray-50/50 px-3 sm:px-4 py-2 sm:py-3 hover:bg-emerald-50 hover:border-emerald-200 hover:text-emerald-900 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className="flex items-end gap-2 max-w-[88%]">
                  {m.role === "assistant" ? (
                    <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Bot className="h-4 w-4" />
                    </div>
                  ) : null}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm max-w-full ${
                      m.role === "user"
                        ? "bg-emerald-600 text-white"
                        : "bg-white border text-gray-900"
                    }`}
                  >
                    <div className="whitespace-pre-wrap break-words">{m.content}</div>
                  </div>
                  {m.role === "user" ? (
                    <div className="h-7 w-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">
                      <User className="h-4 w-4" />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {isLoading ? (
              <div className="flex justify-start">
                <div className="flex items-end gap-2 max-w-[88%]">
                  <div className="h-7 w-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="rounded-2xl bg-white border px-3.5 py-2.5 text-sm text-gray-600 shadow-sm">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking…
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Input area - fixed at bottom */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-white p-3 pb-3 lg:pb-3">
        {/* Build action buttons */}
        {canShowBuildActions ? (
          <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              onClick={() => requestAutonomousBuild("ui_only")}
              disabled={isLoading || isBuilding}
              className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-xs"
            >
              <Play className="h-3 w-3" />
              Build UI
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => requestAutonomousBuild("backend")}
              disabled={isLoading || isBuilding}
              className="h-8 gap-1.5 text-xs border-gray-300"
              title="Add backend APIs + data model"
            >
              + Backend
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => requestAutonomousBuild("auth")}
              disabled={isLoading || isBuilding}
              className="h-8 gap-1.5 text-xs border-gray-300"
              title="Add authentication"
            >
              + Auth
            </Button>
          </div>
        ) : null}

        {/* Chat input form */}
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe what you want to build…"
            disabled={isLoading}
            className="h-10 text-sm border-gray-300 focus:border-emerald-400 focus:ring-emerald-200 bg-gray-50 focus:bg-white"
          />
          <Button
            type="submit"
            disabled={!canSend}
            className="h-10 w-10 px-0 bg-emerald-600 hover:bg-emerald-700 flex-shrink-0 shadow-sm"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>

        {/* Auto-build toggle */}
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            className="text-[11px] text-gray-500 hover:text-gray-700 inline-flex items-center gap-1.5 transition-colors"
            onClick={() => setAutoPreview((v) => !v)}
          >
            <span
              className={`h-3.5 w-3.5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                autoPreview ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-gray-300"
              }`}
            >
              {autoPreview ? <Check className="h-2 w-2" /> : null}
            </span>
            Auto-build
          </button>
        </div>

        {/* Followup questions or ready state */}
        {hasFollowups ? (
          <div className="mt-2.5 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
            <div className="text-[11px] font-medium text-amber-800 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" />
              Quick questions
            </div>
            <div className="mt-1.5 space-y-1.5">
              {followups.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setInput((prev) => prev ? `${prev}\n\n${q}\n` : `${q}\n`)}
                  className="w-full text-left text-[11px] rounded border border-amber-200 bg-white/80 px-2.5 py-1.5 text-amber-800 hover:bg-white hover:border-amber-300 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : readyForBuild ? (
          <div className="mt-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5">
            <div className="text-[11px] font-medium text-emerald-800 flex items-center gap-1.5">
              <Check className="h-3 w-3" />
              Ready to build — click Build UI above
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
