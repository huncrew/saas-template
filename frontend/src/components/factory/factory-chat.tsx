"use client";

import { useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";
import { factoryApi } from "@/lib/factory-api";
import type { FactoryBuild, FactoryProjectChatResponse } from "@/types/factory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Check, Loader2, Send, Sparkles, User } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

const SUGGESTIONS = [
  "Create a SaaS CRUD app with teams and roles",
  "Add an audit log and admin panel",
  "Add Stripe billing (stub) and usage limits",
];

export function FactoryChat({
  projectId,
  onPreviewBuildStarted,
}: {
  projectId: string;
  onPreviewBuildStarted?: (b: FactoryBuild) => void;
}) {
  const { user, isLoaded } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [autoPreview, setAutoPreview] = useState(true);
  const [pending, setPending] = useState<FactoryProjectChatResponse | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => input.trim().length > 0 && !isLoading, [input, isLoading]);

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
      const res = await factoryApi.chatProject(projectId, { message: prompt.trim(), auto_preview: autoPreview });
      const data = res.data;
      if (!data) throw new Error("Chat failed");

      const aiMsg: Message = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: data.assistant?.content || "Ok.",
        createdAt: Date.now(),
      };
      setMessages((prev) => [...prev, aiMsg]);
      setPending(data);

      // Auto-trigger preview when orchestrator suggests it.
      if (autoPreview && data.suggested_action === "build_preview") {
        const b = await factoryApi.createPreviewBuild(projectId);
        if (b.data) onPreviewBuildStarted?.(b.data);
        toast.success("Preview build started");
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
    <div className="h-full flex flex-col">
      <div className="h-12 px-4 flex items-center justify-between border-b bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 truncate">Factory</div>
            <div className="text-xs text-gray-500 truncate">Chat → plan → build</div>
          </div>
        </div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
          Guided
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 bg-[#fafafa]">
        {messages.length === 0 ? (
          <div className="pt-6">
            <div className="rounded-2xl border bg-white p-4">
              <div className="text-sm font-medium text-gray-900">What are we building?</div>
              <div className="mt-1 text-sm text-gray-600">
                Describe the app in one sentence. I&apos;ll propose a plan and we can iterate.
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="text-left text-xs rounded-full border bg-white px-3 py-1.5 hover:bg-gray-50"
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
                    className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-emerald-600 text-white"
                        : "bg-white border text-gray-900"
                    }`}
                  >
                    {m.content}
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

      <div className="border-t bg-white p-3">
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
            placeholder="Describe the change you want…"
            disabled={isLoading}
            className="h-11"
          />
          <Button type="submit" disabled={!canSend} className="h-11 w-11 px-0">
            <Send className="h-4 w-4" />
          </Button>
        </form>
        <div className="mt-3 flex items-center justify-between gap-3">
          <button
            type="button"
            className="text-[11px] text-gray-600 hover:text-gray-900 inline-flex items-center gap-2"
            onClick={() => setAutoPreview((v) => !v)}
          >
            <span
              className={`h-4 w-4 rounded border flex items-center justify-center ${
                autoPreview ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white"
              }`}
            >
              {autoPreview ? <Check className="h-3 w-3" /> : null}
            </span>
            Auto-build preview when ready
          </button>
          <div className="text-[11px] text-gray-500">
            {isLoaded && user?.primaryEmailAddress?.emailAddress
              ? `Signed in: ${user.primaryEmailAddress.emailAddress}`
              : "Dev / session optional"}
          </div>
        </div>

        {pending?.followups?.length ? (
          <div className="mt-3 rounded-xl border bg-gray-50 p-3">
            <div className="text-xs font-medium text-gray-900">Quick questions</div>
            <ul className="mt-2 space-y-1 text-xs text-gray-700 list-disc pl-5">
              {pending.followups.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="mt-2 text-[11px] text-gray-500">
          Tip: start with “Build preview” once you’re happy with the plan.
        </div>
      </div>
    </div>
  );
}


