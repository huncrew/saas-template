"use client";

import { useRouter } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { factoryApi } from "@/lib/factory-api";
import { toast } from "sonner";
import {
  ArrowRight, Sparkles, Zap, Shield, Globe,
  Loader2, Code2, Play
} from "lucide-react";

const EXAMPLES = [
  "A task management app with teams and priorities",
  "An invoice generator with PDF export",
  "A customer feedback portal with analytics",
  "A booking system for appointments",
];

export default function Home() {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rotate placeholder examples
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isCreating) return;

    setIsCreating(true);
    try {
      // Create a new project
      const projectName = input.slice(0, 50).trim() || "My App";
      const res = await factoryApi.createProject({
        name: projectName,
        template_id: "saas-crud",
      });

      if (!res.data?.project_id) {
        throw new Error("Failed to create project");
      }

      // Send the initial chat message
      await factoryApi.chatProject(res.data.project_id, {
        message: input.trim(),
        auto_preview: false,
        history: [],
      });

      // Navigate to the project
      router.push(`/projects/${res.data.project_id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to start. Please try again.");
      setIsCreating(false);
    }
  }

  function handleExampleClick(example: string) {
    setInput(example);
    inputRef.current?.focus();
  }

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <Navigation />

      <main className="pt-16">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-50 via-white to-blue-50" />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-to-b from-emerald-100/40 to-transparent rounded-full blur-3xl" />

          <div className="relative px-4 sm:px-6 lg:px-8 pt-20 pb-32">
            <div className="mx-auto max-w-3xl text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 backdrop-blur px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm mb-8">
                <Sparkles className="h-4 w-4" />
                AI-Powered App Builder
              </div>

              {/* Headline */}
              <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 leading-[1.1]">
                Describe it.
                <br />
                <span className="bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
                  Build it.
                </span>
              </h1>

              <p className="mt-6 text-xl text-gray-600 max-w-xl mx-auto">
                Turn your ideas into production-ready applications.
                Just describe what you want to build.
              </p>

              {/* Chat Input */}
              <form onSubmit={handleSubmit} className="mt-10">
                <div className="relative mx-auto max-w-2xl">
                  <div className="relative rounded-2xl border border-gray-200 bg-white shadow-xl shadow-gray-200/50 overflow-hidden">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder={EXAMPLES[placeholderIndex]}
                      disabled={isCreating}
                      rows={3}
                      className="w-full resize-none border-0 bg-transparent px-5 py-4 text-lg placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:opacity-50"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSubmit(e);
                        }
                      }}
                    />
                    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 bg-gray-50/50">
                      <div className="text-xs text-gray-500">
                        Press Enter to start building
                      </div>
                      <Button
                        type="submit"
                        disabled={!input.trim() || isCreating}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                      >
                        {isCreating ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Creating...
                          </>
                        ) : (
                          <>
                            Start Building
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Example Pills */}
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <span className="text-sm text-gray-500 mr-2">Try:</span>
                {EXAMPLES.slice(0, 3).map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => handleExampleClick(example)}
                    className="text-sm px-3 py-1.5 rounded-full border border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors text-gray-600"
                  >
                    {example.length > 35 ? example.slice(0, 35) + "..." : example}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features Strip */}
        <section className="border-y border-gray-200 bg-white py-8">
          <div className="mx-auto max-w-5xl px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Instant Preview</div>
                  <div className="text-sm text-gray-500">See it live</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Code2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Full Code</div>
                  <div className="text-sm text-gray-500">You own it</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Secure</div>
                  <div className="text-sm text-gray-500">Built-in checks</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-orange-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Deploy</div>
                  <div className="text-sm text-gray-500">One click</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-20 px-4">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
              From idea to app in minutes
            </h2>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  1
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Describe</h3>
                <p className="text-gray-600">
                  Tell us what you want to build in plain English. Our AI understands your requirements.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  2
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Preview</h3>
                <p className="text-gray-600">
                  Get an instant live preview. Iterate on the design and features through chat.
                </p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-purple-100 text-purple-600 font-bold text-xl flex items-center justify-center mx-auto mb-4">
                  3
                </div>
                <h3 className="font-semibold text-gray-900 mb-2">Deploy</h3>
                <p className="text-gray-600">
                  Deploy to production with one click. Get your own domain, database, and infrastructure.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Demo Preview */}
        <section className="pb-20 px-4">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="text-sm text-gray-500 font-mono">oasify.ai/projects/demo</div>
              </div>
              <div className="aspect-video bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <Play className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">See It In Action</h3>
                  <p className="text-gray-600 mb-4">Watch how Oasify builds a complete app</p>
                  <Button variant="outline" className="gap-2">
                    <Play className="w-4 h-4" />
                    Watch Demo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 bg-gradient-to-br from-emerald-600 to-blue-600">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to build something amazing?
            </h2>
            <p className="text-emerald-100 text-lg mb-8">
              Start building your app right now. No credit card required.
            </p>
            <Button
              size="lg"
              className="bg-white text-emerald-600 hover:bg-gray-100 gap-2 font-semibold"
              onClick={() => inputRef.current?.focus()}
            >
              <Sparkles className="w-5 h-5" />
              Start Building Free
            </Button>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-gray-200 bg-white py-8">
          <div className="mx-auto max-w-5xl px-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-gray-900">Oasify</span>
            </div>
            <div className="text-sm text-gray-500">
              Built with AI. Powered by you.
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}
