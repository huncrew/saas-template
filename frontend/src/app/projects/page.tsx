"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { factoryApi } from "@/lib/factory-api";
import type { FactoryProject } from "@/types/factory";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Sparkles, Clock, ArrowRight, Loader2,
  Calendar, Search, Eye, Rocket, Code2, Zap,
  FolderOpen, MoreHorizontal, ExternalLink
} from "lucide-react";
import { Navigation } from "@/components/navigation";

const EXAMPLES = [
  "A project management tool with kanban boards",
  "Customer support ticketing system",
  "Invoice generator with PDF export",
  "Team collaboration dashboard",
];

export default function ProjectsPage() {
  const router = useRouter();
  const { isLoaded } = useAuth();
  const [projects, setProjects] = useState<FactoryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [input, setInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Rotate placeholder examples
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % EXAMPLES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    return projects.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.template_id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [projects, searchQuery]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const res = await factoryApi.listProjects();
        if (!cancelled) setProjects(res.data || []);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load projects");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    if (isLoaded) load();
    return () => { cancelled = true; };
  }, [isLoaded]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isCreating) return;

    setIsCreating(true);
    try {
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

      router.push(`/projects/${res.data.project_id}`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to create project");
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
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-emerald-100/40 to-transparent rounded-full blur-3xl" />

          <div className="relative px-4 sm:px-6 lg:px-8 pt-8 sm:pt-12 pb-10 sm:pb-16">
            <div className="mx-auto max-w-3xl text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 sm:gap-2 rounded-full border border-emerald-200 bg-white/80 backdrop-blur px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-emerald-700 shadow-sm mb-4 sm:mb-6">
                <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                Your Workspace
              </div>

              {/* Headline */}
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 leading-[1.15] mb-3 sm:mb-4">
                What would you like to
                <br className="hidden xs:inline" />
                <span className="xs:hidden"> </span>
                <span className="bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
                  build today?
                </span>
              </h1>

              <p className="text-base sm:text-lg text-gray-600 mb-6 sm:mb-8 max-w-xl mx-auto px-2 sm:px-0">
                Describe your app idea and let AI handle the rest.
              </p>

              {/* Main Input */}
              <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
                <div className="relative bg-white rounded-xl sm:rounded-2xl shadow-xl border border-gray-200/60 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-shadow">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={EXAMPLES[placeholderIndex]}
                    rows={2}
                    className="w-full resize-none border-0 bg-transparent px-4 sm:px-5 py-3 sm:py-4 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 text-base sm:text-lg"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 border-t border-gray-100 bg-gray-50/50">
                    <div className="hidden sm:flex items-center gap-2 text-sm text-gray-500">
                      <Zap className="h-4 w-4 text-emerald-500" />
                      <span>AI-powered</span>
                    </div>
                    <Button
                      type="submit"
                      disabled={!input.trim() || isCreating}
                      className="gap-1.5 sm:gap-2 bg-gradient-to-r from-emerald-600 to-blue-600 hover:from-emerald-700 hover:to-blue-700 shadow-md px-4 sm:px-6 h-9 sm:h-10 text-sm sm:text-base ml-auto"
                    >
                      {isCreating ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
                          <span className="hidden xs:inline">Creating...</span>
                        </>
                      ) : (
                        <>
                          Create
                          <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </form>

              {/* Example Pills - Hidden on very small screens, scrollable on mobile */}
              <div className="mt-4 sm:mt-6 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                <div className="flex sm:flex-wrap sm:justify-center gap-2 min-w-max sm:min-w-0">
                  {EXAMPLES.map((example) => (
                    <button
                      key={example}
                      onClick={() => handleExampleClick(example)}
                      className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-700 hover:bg-emerald-50 transition-colors shadow-sm whitespace-nowrap"
                    >
                      {example}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Projects Section */}
        <section className="px-4 sm:px-6 lg:px-8 pb-16">
          <div className="mx-auto max-w-6xl">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gray-100">
                  <FolderOpen className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Your Projects</h2>
                  <p className="text-sm text-gray-500">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {projects.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent w-48"
                  />
                </div>
              )}
            </div>

            {/* Projects Grid */}
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg" />
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
                        <div className="h-3 bg-gray-100 rounded w-1/2" />
                      </div>
                    </div>
                    <div className="h-3 bg-gray-100 rounded w-full" />
                  </div>
                ))}
              </div>
            ) : filteredProjects.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Rocket className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {searchQuery ? 'No projects found' : 'No projects yet'}
                </h3>
                <p className="text-gray-600 max-w-md mx-auto mb-6">
                  {searchQuery
                    ? `No projects match "${searchQuery}".`
                    : 'Describe what you want to build above and create your first project.'
                  }
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredProjects.map((project) => (
                  <Link
                    key={project.project_id}
                    href={`/projects/${project.project_id}`}
                    className="group bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-300 hover:shadow-lg transition-all duration-200"
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="p-2.5 rounded-lg bg-gradient-to-br from-emerald-50 to-blue-50 group-hover:from-emerald-100 group-hover:to-blue-100 transition-colors">
                          <Code2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 truncate group-hover:text-emerald-700 transition-colors">
                            {project.name}
                          </h3>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="text-xs bg-gray-100 text-gray-600">
                              {project.template_id}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <ArrowRight className="w-5 h-5 text-emerald-600" />
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(project.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                      <span className="font-mono text-xs text-gray-400">
                        {project.project_id.slice(5, 13)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
