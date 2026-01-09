"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { factoryApi } from "@/lib/factory-api";
import type { FactoryBuild, FactoryProject } from "@/types/factory";
import { FactoryChat } from "@/components/factory/factory-chat";
import { FactoryDevBanner } from "@/components/factory/dev-banner";
import { ResizableSplit } from "@/components/factory/resizable-split";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Diff, ExternalLink, FileText, Play, Rocket, RefreshCw, ShieldCheck,
  GitBranch, CheckCircle, AlertTriangle, XCircle, Clock, Download,
  Code2, Database, Globe, Server, Eye, RotateCcw, Layers
} from "lucide-react";
import { MermaidDiagram } from "@/components/factory/mermaid-diagram";

function BuildStatusPill({ build }: { build?: FactoryBuild }) {
  if (!build) return (
    <Badge variant="secondary" className="text-[10px] sm:text-xs font-mono px-1.5 sm:px-2 py-0.5">
      <Clock className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5 sm:mr-1" />
      <span className="hidden sm:inline">No builds</span>
    </Badge>
  );

  const getStatusConfig = () => {
    switch (build.status) {
      case "succeeded":
        return {
          color: "bg-emerald-500/10 text-emerald-700 border-emerald-200 ring-emerald-500/20",
          icon: CheckCircle,
          pulse: false
        };
      case "failed":
        return {
          color: "bg-red-500/10 text-red-700 border-red-200 ring-red-500/20",
          icon: XCircle,
          pulse: false
        };
      case "running":
        return {
          color: "bg-blue-500/10 text-blue-700 border-blue-200 ring-blue-500/20",
          icon: RefreshCw,
          pulse: true
        };
      default:
        return {
          color: "bg-gray-500/10 text-gray-700 border-gray-200 ring-gray-500/20",
          icon: Clock,
          pulse: false
        };
    }
  };

  const { color, icon: Icon, pulse } = getStatusConfig();

  return (
    <div className={`inline-flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-full border ring-1 font-mono ${color}`}>
      <Icon className={`h-2.5 w-2.5 sm:h-3 sm:w-3 ${pulse ? 'animate-spin' : ''}`} />
      <span className="hidden sm:inline">{build.type} •</span> {build.status}
    </div>
  );
}

export default function ProjectWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isLoaded } = useAuth();

  const [project, setProject] = useState<FactoryProject | null>(null);
  const [activeBuild, setActiveBuild] = useState<FactoryBuild | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [projectLoadError, setProjectLoadError] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState<"preview" | "deploy" | "autonomous" | null>(null);

  // Autonomous build progress state
  const [isAutonomousMode, setIsAutonomousMode] = useState(false);
  const [autonomousProgress, setAutonomousProgress] = useState<{
    attempt: number;
    max_attempts: number;
    message: string;
    errors: string[];
    improvements: string[];
  } | null>(null);

  // Architecture diagram state
  const [architectureDiagram, setArchitectureDiagram] = useState<string | null>(null);
  const [entityDiagram, setEntityDiagram] = useState<string | null>(null);
  const [isLoadingArchitecture, setIsLoadingArchitecture] = useState(false);

  const previewUrl = activeBuild?.artifacts?.preview_url;
  const previewReady = !!previewUrl && activeBuild?.type === "preview" && activeBuild?.status === "succeeded";
  const previewFailed = activeBuild?.type === "preview" && activeBuild?.status === "failed";
  const previewRunning = activeBuild?.type === "preview" && (activeBuild?.status === "queued" || activeBuild?.status === "running");

  const canTrigger = useMemo(() => !isTriggering && !!project?.project_id, [isTriggering, project?.project_id]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setProjectLoadError(null);
      try {
        const p = await factoryApi.getProject(projectId);
        if (cancelled) return;
        setProject(p.data || null);
        if (!p.data) setProjectLoadError("Project not found.");

        const lastBuildId = p.data?.last_build_id;
        if (lastBuildId) {
          const b = await factoryApi.getBuild(lastBuildId);
          if (!cancelled) setActiveBuild(b.data || null);
        } else {
          setActiveBuild(null);
        }
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "Failed to load project";
        setProjectLoadError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    if (isLoaded) load();
    return () => {
      cancelled = true;
    };
  }, [projectId, isLoaded]);

  useEffect(() => {
    const buildId = activeBuild?.build_id;
    const buildStatus = activeBuild?.status;
    if (!buildId) return;
    if (buildStatus !== "queued" && buildStatus !== "running") return;

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        const res = await factoryApi.getBuild(buildId);
        if (!cancelled && res.data) setActiveBuild(res.data);
      } catch (e) {
        console.error(e);
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeBuild?.build_id, activeBuild?.status]);

  // Fetch architecture diagrams when project changes or has spec
  useEffect(() => {
    async function fetchArchitecture() {
      if (!project?.project_id) return;

      setIsLoadingArchitecture(true);
      try {
        const response = await fetch(`/api/factory/projects/${project.project_id}/architecture`);
        if (response.ok) {
          const data = await response.json();
          setArchitectureDiagram(data.architecture_diagram || null);
          setEntityDiagram(data.entity_diagram || null);
        }
      } catch (err) {
        console.error("Failed to fetch architecture:", err);
      } finally {
        setIsLoadingArchitecture(false);
      }
    }

    fetchArchitecture();
  }, [project?.project_id, project?.spec_updated_at]);

  async function triggerPreview() {
    // Use autonomous build flow (includes retry loop with AI fixes)
    triggerAutonomousBuild();
  }

  async function triggerAutonomousBuild() {
    if (!canTrigger) return;
    setIsTriggering("autonomous");
    setIsAutonomousMode(true);
    setAutonomousProgress({
      attempt: 1,
      max_attempts: 3,
      message: "Starting autonomous build...",
      errors: [],
      improvements: [],
    });

    try {
      // Use the Next.js API route that properly injects X-User-Id header
      const response = await fetch(`/api/factory/projects/${projectId}/build-autonomous`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Build request failed: ${response.status}`);
      }

      // Read SSE stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const collectedErrors: string[] = [];
      const collectedImprovements: string[] = [];

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              // Handle different phases
              if (data.phase === "building" || data.phase === "analyzing_errors" || data.phase === "retrying" || data.phase === "generating") {
                if (data.errors && data.errors.length > 0) {
                  collectedErrors.push(...data.errors.filter((e: string) => !collectedErrors.includes(e)));
                }
                if (data.improvements && data.improvements.length > 0) {
                  collectedImprovements.push(...data.improvements.filter((i: string) => !collectedImprovements.includes(i)));
                }
                setAutonomousProgress({
                  attempt: data.attempt || 1,
                  max_attempts: data.max_attempts || 3,
                  message: data.message || "Building...",
                  errors: collectedErrors.slice(-5),
                  improvements: collectedImprovements.slice(-5),
                });
              }

              if (data.phase === "succeeded") {
                toast.success("Autonomous build succeeded!");
                setIsAutonomousMode(false);
                setAutonomousProgress(null);
                // Refresh build info using the build_id from the event
                if (data.build_id) {
                  const buildRes = await factoryApi.getBuild(data.build_id);
                  if (buildRes.data) setActiveBuild(buildRes.data);
                }
              }

              if (data.phase === "failed") {
                toast.error(data.message || "Build failed after retries");
                setIsAutonomousMode(false);
                setAutonomousProgress(null);
              }
            } catch {
              // Ignore JSON parse errors for incomplete data
            }
          }
        }
      }
    } catch (e) {
      console.error("Autonomous build error:", e);
      toast.error(e instanceof Error ? e.message : "Autonomous build failed");
      setIsAutonomousMode(false);
      setAutonomousProgress(null);
    } finally {
      setIsTriggering(null);
    }
  }

  async function triggerDeploy() {
    if (!canTrigger) return;
    setIsTriggering("deploy");
    try {
      const res = await factoryApi.createDeployBuild(projectId);
      setActiveBuild(res.data || null);
      toast.success("Deploy started");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to start deploy");
    } finally {
      setIsTriggering(null);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafa] p-6">
        <Card className="max-w-4xl mx-auto">
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
            <CardDescription>Opening your workspace.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 to-white">
      <FactoryDevBanner />

      <div className="h-[calc(100vh-0px)]">
        <ResizableSplit
          className="relative h-full"
          storageKey={`factory.split.${projectId}`}
          left={
            <div className="h-full bg-white border-r border-gray-200 shadow-sm">
              <div className="h-12 sm:h-14 px-3 sm:px-5 border-b border-gray-100 bg-white/80 backdrop-blur-sm flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs sm:text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5 sm:gap-2">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                    {project?.name || "Project"}
                  </div>
                  <div className="text-[10px] sm:text-xs text-gray-500 truncate font-mono">
                    {projectId?.slice(0, 8)}…
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <BuildStatusPill build={activeBuild || undefined} />
                </div>
              </div>
              {projectLoadError ? (
                <div className="p-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Project not available</CardTitle>
                      <CardDescription>{projectLoadError}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm text-gray-600">
                      This usually happens if the project was created while the orchestrator URL wasn’t configured (mock mode).
                      Create a new project from <span className="font-medium">/projects</span>.
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <FactoryChat projectId={projectId} onPreviewBuildStarted={(b) => setActiveBuild(b)} />
              )}
            </div>
          }
          right={
            <div className="h-full flex flex-col min-w-0 bg-gradient-to-b from-white to-gray-50/50">
              {/* Header - hidden on mobile, shown on sm+ */}
              <div className="hidden sm:flex h-14 px-5 border-b border-gray-100 bg-white/95 backdrop-blur-sm items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded font-mono">
                    Chat → Preview → Deploy
                  </div>
                  {activeBuild && (
                    <div className="hidden lg:block text-xs text-gray-500 font-mono">
                      {activeBuild.started_at ? new Date(activeBuild.started_at).toLocaleTimeString() : ''}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={triggerPreview}
                    disabled={!canTrigger || isTriggering === "autonomous"}
                    className="gap-2 h-9 px-3 bg-emerald-600 hover:bg-emerald-700 shadow-sm text-sm"
                    size="sm"
                  >
                    {isTriggering === "autonomous" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    {isTriggering === "autonomous" ? "Building..." : "Build"}
                  </Button>
                  <Button
                    onClick={triggerDeploy}
                    disabled={!canTrigger}
                    variant="outline"
                    className="gap-2 h-9 px-3 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300 text-sm"
                    size="sm"
                  >
                    {isTriggering === "deploy" ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Rocket className="h-4 w-4" />
                    )}
                    Deploy
                  </Button>
                </div>
              </div>

              <div className="flex-1 min-h-0 p-2 sm:p-4 lg:p-5">
                <Tabs defaultValue="preview" className="w-full h-full flex flex-col">
                  {/* Mobile: Compact tabs with inline build button */}
                  <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0">
                    <TabsList className="w-fit bg-white/80 backdrop-blur-sm border border-gray-200 shadow-sm h-9">
                      <TabsTrigger value="preview" className="gap-1 px-2 h-7 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <Eye className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Preview</span>
                      </TabsTrigger>
                      <TabsTrigger value="changes" className="gap-1 px-2 h-7 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <GitBranch className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Changes</span>
                      </TabsTrigger>
                      <TabsTrigger value="architecture" className="gap-1 px-2 h-7 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <Server className="h-3.5 w-3.5" /> <span className="hidden md:inline">Arch</span>
                      </TabsTrigger>
                      <TabsTrigger value="checks" className="gap-1 px-2 h-7 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <ShieldCheck className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Checks</span>
                      </TabsTrigger>
                      <TabsTrigger value="deploy" className="gap-1 px-2 h-7 text-xs data-[state=active]:bg-emerald-500 data-[state=active]:text-white">
                        <Globe className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Deploy</span>
                      </TabsTrigger>
                    </TabsList>
                    {/* Mobile-only build button */}
                    <Button
                      onClick={triggerPreview}
                      disabled={!canTrigger || isTriggering === "autonomous"}
                      className="sm:hidden h-9 px-3 bg-emerald-600 hover:bg-emerald-700 shadow-sm text-xs flex-shrink-0"
                      size="sm"
                    >
                      {isTriggering === "autonomous" ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>

                  <div className="flex-1 min-h-0 mt-2 sm:mt-4">
                    <TabsContent value="preview" className="h-full">
                      <Card className="h-full border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                        {/* Compact header on mobile */}
                        <CardHeader className="flex flex-row items-center justify-between gap-2 p-3 sm:p-6 pb-2 sm:pb-4">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0" />
                            <CardTitle className="text-sm sm:text-lg font-semibold text-gray-900">
                              Live Preview
                            </CardTitle>
                            {previewReady && (
                              <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-[10px] sm:text-xs px-1.5 py-0">
                                <CheckCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3 mr-0.5" />
                                <span className="hidden sm:inline">Ready</span>
                              </Badge>
                            )}
                          </div>
                          {previewReady && (
                            <Button asChild variant="outline" size="sm" className="gap-1.5 border-emerald-200 hover:bg-emerald-50 h-7 sm:h-9 px-2 sm:px-3 text-xs">
                              <a href={previewUrl} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
                                <span className="hidden sm:inline">Open</span>
                              </a>
                            </Button>
                          )}
                        </CardHeader>
                        <CardContent className="h-[calc(100%-6rem)] p-0">
                          {/* Autonomous Build Progress - Shown during autonomous build */}
                          {isAutonomousMode && autonomousProgress ? (
                            <div className="h-full w-full rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-emerald-50 flex items-center justify-center p-6">
                              <div className="max-w-lg w-full">
                                <div className="flex items-center gap-3 mb-6">
                                  <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-emerald-100 rounded-full flex items-center justify-center">
                                    <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                                  </div>
                                  <div>
                                    <div className="text-lg font-semibold text-gray-900">AI Building Your App</div>
                                    <div className="text-sm text-gray-600">Automatic error detection and fixes</div>
                                  </div>
                                  <Badge className="ml-auto bg-blue-100 text-blue-700 border-blue-200">
                                    Attempt {autonomousProgress.attempt}/{autonomousProgress.max_attempts}
                                  </Badge>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                                  <div
                                    className="bg-gradient-to-r from-blue-500 to-emerald-500 h-2 rounded-full transition-all duration-500"
                                    style={{ width: `${(autonomousProgress.attempt / autonomousProgress.max_attempts) * 100}%` }}
                                  />
                                </div>

                                {/* Current Status */}
                                <div className="text-sm text-gray-700 mb-4 p-3 bg-white/70 rounded-lg border border-gray-200">
                                  <RefreshCw className="h-4 w-4 inline mr-2 animate-spin text-blue-600" />
                                  {autonomousProgress.message}
                                </div>

                                {/* Errors Found */}
                                {autonomousProgress.errors.length > 0 && (
                                  <div className="mb-4">
                                    <div className="text-sm font-medium text-red-700 mb-2 flex items-center gap-2">
                                      <XCircle className="h-4 w-4" />
                                      Errors Found ({autonomousProgress.errors.length})
                                    </div>
                                    <div className="space-y-2 max-h-32 overflow-auto">
                                      {autonomousProgress.errors.slice(-3).map((err, i) => (
                                        <div key={i} className="text-xs text-red-600 p-2 bg-red-50 rounded border border-red-200 font-mono">
                                          {err.length > 150 ? err.slice(0, 150) + '...' : err}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Improvements Being Applied */}
                                {autonomousProgress.improvements.length > 0 && (
                                  <div>
                                    <div className="text-sm font-medium text-emerald-700 mb-2 flex items-center gap-2">
                                      <CheckCircle className="h-4 w-4" />
                                      AI Fixing Issues
                                    </div>
                                    <div className="space-y-2">
                                      {autonomousProgress.improvements.slice(-3).map((imp, i) => (
                                        <div key={i} className="text-xs text-emerald-600 p-2 bg-emerald-50 rounded border border-emerald-200 flex items-start gap-2">
                                          <CheckCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                          {imp}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                <div className="text-xs text-gray-500 mt-4 text-center">
                                  The AI is automatically detecting and fixing build errors
                                </div>
                              </div>
                            </div>
                          ) : previewReady ? (
                            <div className="h-full w-full overflow-hidden bg-white border border-gray-200 rounded-xl shadow-inner">
                              <div className="h-8 bg-gray-50 border-b border-gray-200 flex items-center px-4 gap-3">
                                <div className="flex gap-1.5">
                                  <div className="w-3 h-3 rounded-full bg-red-400" />
                                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                                  <div className="w-3 h-3 rounded-full bg-green-400" />
                                </div>
                                <div className="text-xs text-gray-500 font-mono truncate">
                                  {previewUrl}
                                </div>
                                <div className="ml-auto flex items-center gap-1">
                                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                  <span className="text-xs text-gray-600">Live</span>
                                </div>
                              </div>
                              <iframe
                                key={`${activeBuild?.build_id}:${activeBuild?.finished_at || activeBuild?.started_at || ""}`}
                                title="Preview"
                                src={`${previewUrl}${previewUrl.includes("?") ? "&" : "?"}cb=${encodeURIComponent(
                                  activeBuild?.finished_at || activeBuild?.started_at || String(Date.now())
                                )}`}
                                className="w-full h-[calc(100%-2rem)] bg-white"
                              />
                            </div>
                          ) : previewRunning ? (
                            <div className="h-full w-full rounded-xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 flex items-center justify-center">
                              <div className="max-w-md text-center px-6">
                                <div className="w-16 h-16 mx-auto mb-4 bg-emerald-100 rounded-full flex items-center justify-center">
                                  <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin" />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 mb-2">Building preview…</div>
                                <div className="text-sm text-gray-600 mb-4">
                                  Your application is being built and deployed.
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                  <div className="bg-emerald-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }} />
                                </div>
                                <div className="text-xs text-gray-500">This usually takes 1-2 minutes</div>
                              </div>
                            </div>
                          ) : previewFailed ? (
                            <div className="h-full w-full rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-white flex items-center justify-center">
                              <div className="max-w-md text-center px-6">
                                <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
                                  <XCircle className="w-8 h-8 text-red-600" />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 mb-2">Build failed</div>
                                <div className="text-sm text-gray-600 mb-4">
                                  {activeBuild?.error || "Something went wrong during the build process."}
                                </div>
                                <div className="flex gap-2 justify-center">
                                  <Button onClick={triggerPreview} disabled={!canTrigger} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                                    <RotateCcw className="h-4 w-4" /> Try again
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full w-full rounded-xl border border-gray-200 bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
                              <div className="max-w-md text-center px-6">
                                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                                  <Eye className="w-8 h-8 text-gray-400" />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 mb-2">Ready to preview</div>
                                <div className="text-sm text-gray-600 mb-6">
                                  Start a preview build to see your application in action.
                                </div>
                                <Button onClick={triggerPreview} disabled={!canTrigger} className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg">
                                  <Play className="h-4 w-4" /> Build preview
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="changes" className="h-full">
                      <Card className="h-full border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <GitBranch className="h-5 w-5 text-emerald-600" />
                            Code Changes
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-600">
                            Review modifications made to your codebase
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[calc(100%-6rem)] p-0">
                          {activeBuild ? (
                            <div className="h-full flex flex-col">
                              <div className="flex-1 overflow-auto">
                                <div className="p-6 space-y-6">
                                  {/* Recent Changes */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                      <GitBranch className="h-4 w-4" />
                                      Recent Commits
                                    </h4>
                                    <div className="space-y-3">
                                      <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                        <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                                          <Code2 className="h-4 w-4 text-emerald-600" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="text-sm font-medium text-gray-900">
                                            {activeBuild.type === 'preview' ? 'Preview build' : 'Deploy build'} #{activeBuild.build_id.slice(0, 8)}
                                          </div>
                                          <div className="text-xs text-gray-500 font-mono">
                                            {activeBuild.started_at ? new Date(activeBuild.started_at).toLocaleString() : 'Unknown'}
                                          </div>
                                        </div>
                                        <Badge variant="secondary" className="text-xs">
                                          {activeBuild.status}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>

                                  {/* File Changes */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                      <FileText className="h-4 w-4" />
                                      Modified Files
                                    </h4>
                                    <div className="space-y-2">
                                      <div className="flex items-center justify-between p-2 bg-green-50 border border-green-200 rounded">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                                          <span className="text-sm font-mono">src/components/ui/button.tsx</span>
                                        </div>
                                        <span className="text-xs text-green-700">+12 -3</span>
                                      </div>
                                      <div className="flex items-center justify-between p-2 bg-blue-50 border border-blue-200 rounded">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-blue-500 rounded-full" />
                                          <span className="text-sm font-mono">src/app/layout.tsx</span>
                                        </div>
                                        <span className="text-xs text-blue-700">+5 -1</span>
                                      </div>
                                      <div className="flex items-center justify-between p-2 bg-yellow-50 border border-yellow-200 rounded">
                                        <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                                          <span className="text-sm font-mono">package.json</span>
                                        </div>
                                        <span className="text-xs text-yellow-700">+1 -1</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Diff Preview */}
                                  <div>
                                    <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                      <Diff className="h-4 w-4" />
                                      Code Diff
                                    </h4>
                                    <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs overflow-auto">
                                      <div className="text-gray-300">
                                        <div className="text-blue-400">@@ -12,7 +12,19 @@ export function Button(props)</div>
                                        <div className="bg-red-900/30 text-red-300">-  "bg-primary text-primary-foreground hover:bg-primary/90"</div>
                                        <div className="bg-green-900/30 text-green-300">+  "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"</div>
                                        <div className="text-gray-400">   ),</div>
                                        <div className="text-gray-400">   destructive: (</div>
                                        <div className="bg-green-900/30 text-green-300">+    "bg-red-500 text-white hover:bg-red-600"</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-center px-6">
                                <GitBranch className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                <div className="text-lg font-medium text-gray-500 mb-2">No changes yet</div>
                                <div className="text-sm text-gray-400">
                                  Code changes will appear here after your first build
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="architecture" className="h-full">
                      <Card className="h-full border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Server className="h-5 w-5 text-emerald-600" />
                            System Architecture
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-600">
                            Live architecture diagrams generated from your spec
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[calc(100%-6rem)] overflow-auto">
                          {isLoadingArchitecture ? (
                            <div className="h-full flex items-center justify-center">
                              <div className="flex items-center gap-3 text-gray-600">
                                <RefreshCw className="h-5 w-5 animate-spin" />
                                <span>Loading architecture diagrams...</span>
                              </div>
                            </div>
                          ) : architectureDiagram || entityDiagram ? (
                            <div className="space-y-6">
                              {/* Architecture Flowchart */}
                              {architectureDiagram && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Layers className="h-4 w-4" />
                                    Application Architecture
                                  </h4>
                                  <div className="p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg">
                                    <MermaidDiagram chart={architectureDiagram} className="min-h-[200px]" />
                                  </div>
                                </div>
                              )}

                              {/* Entity Relationship Diagram */}
                              {entityDiagram && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                    <Database className="h-4 w-4" />
                                    Data Model
                                  </h4>
                                  <div className="p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-lg">
                                    <MermaidDiagram chart={entityDiagram} className="min-h-[200px]" />
                                  </div>
                                </div>
                              )}

                              {/* Infrastructure Stack - Static */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <Server className="h-4 w-4" />
                                  Infrastructure Stack
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Server className="h-5 w-5 text-blue-600" />
                                      <span className="font-semibold text-blue-900">Frontend</span>
                                    </div>
                                    <div className="text-sm text-blue-700">Next.js 15, React 19</div>
                                    <div className="text-xs text-blue-600 mt-1">CloudFront + S3</div>
                                  </div>
                                  <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Database className="h-5 w-5 text-purple-600" />
                                      <span className="font-semibold text-purple-900">Backend</span>
                                    </div>
                                    <div className="text-sm text-purple-700">Python API, ECS</div>
                                    <div className="text-xs text-purple-600 mt-1">Auto-scaling</div>
                                  </div>
                                  <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
                                    <div className="flex items-center gap-2 mb-2">
                                      <Globe className="h-5 w-5 text-green-600" />
                                      <span className="font-semibold text-green-900">Database</span>
                                    </div>
                                    <div className="text-sm text-green-700">DynamoDB</div>
                                    <div className="text-xs text-green-600 mt-1">Serverless</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-center px-6 max-w-md">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Layers className="w-8 h-8 text-gray-400" />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 mb-2">No Architecture Yet</div>
                                <div className="text-sm text-gray-600">
                                  Chat with the AI to describe your application. Architecture diagrams will be generated from your specification.
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="checks" className="h-full">
                      <Card className="h-full border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-emerald-600" />
                            Security & Quality Checks
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-600">
                            Automated security scans and quality validation
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[calc(100%-6rem)] overflow-auto">
                          <div className="space-y-6">
                            {/* Security Checks */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <ShieldCheck className="h-4 w-4" />
                                Security Scans
                              </h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Secret Detection</div>
                                      <div className="text-xs text-gray-600">No exposed secrets or API keys found</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Vulnerability Scan</div>
                                      <div className="text-xs text-gray-600">0 high severity issues detected</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">CORS Configuration</div>
                                      <div className="text-xs text-gray-600">Consider restricting CORS origins for production</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                                    Warning
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {/* Code Quality */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Code2 className="h-4 w-4" />
                                Code Quality
                              </h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">TypeScript Compilation</div>
                                      <div className="text-xs text-gray-600">No type errors found</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">ESLint Analysis</div>
                                      <div className="text-xs text-gray-600">All linting rules passed</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Test Coverage</div>
                                      <div className="text-xs text-gray-600">87% code coverage achieved</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Good
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {/* Infrastructure */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                <Server className="h-4 w-4" />
                                Infrastructure Validation
                              </h4>
                              <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Terraform Validation</div>
                                      <div className="text-xs text-gray-600">All terraform configurations valid</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                                  <div className="flex items-center gap-3">
                                    <CheckCircle className="h-5 w-5 text-green-600" />
                                    <div>
                                      <div className="text-sm font-medium text-gray-900">Security Groups</div>
                                      <div className="text-xs text-gray-600">No overly permissive rules detected</div>
                                    </div>
                                  </div>
                                  <Badge variant="secondary" className="bg-green-100 text-green-700">
                                    Passed
                                  </Badge>
                                </div>
                              </div>
                            </div>

                            {/* Check Summary */}
                            <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                              <div className="flex items-center gap-3 mb-2">
                                <CheckCircle className="h-5 w-5 text-green-600" />
                                <div className="font-semibold text-green-900">All Checks Passed</div>
                              </div>
                              <div className="text-sm text-green-700">
                                Your application passed all security and quality checks. Ready for deployment.
                              </div>
                              <div className="mt-3 flex gap-2">
                                <Button size="sm" variant="outline" className="gap-2 text-xs border-green-300 hover:bg-green-100">
                                  <Download className="h-3 w-3" />
                                  Download Report
                                </Button>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </TabsContent>

                    <TabsContent value="deploy" className="h-full">
                      <Card className="h-full border-0 shadow-lg bg-white/80 backdrop-blur-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            <Globe className="h-5 w-5 text-emerald-600" />
                            Production Deployment
                          </CardTitle>
                          <CardDescription className="text-sm text-gray-600">
                            Manage and monitor your live application deployment
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[calc(100%-6rem)] overflow-auto">
                          {activeBuild?.type === 'deploy' ? (
                            <div className="space-y-6">
                              {/* Deployment Status */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <Rocket className="h-4 w-4" />
                                  Deployment Status
                                </h4>
                                <div className="p-4 bg-gradient-to-r from-emerald-50 to-green-50 border border-emerald-200 rounded-lg">
                                  <div className="flex items-center gap-3 mb-3">
                                    <CheckCircle className="h-6 w-6 text-emerald-600" />
                                    <div>
                                      <div className="font-semibold text-emerald-900">Successfully Deployed</div>
                                      <div className="text-sm text-emerald-700">
                                        Build #{activeBuild.build_id.slice(0, 8)} deployed at {activeBuild.finished_at ? new Date(activeBuild.finished_at).toLocaleString() : activeBuild.started_at ? new Date(activeBuild.started_at).toLocaleString() : 'Unknown'}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex gap-3">
                                    <Button size="sm" variant="outline" className="gap-2 border-emerald-300 hover:bg-emerald-100">
                                      <ExternalLink className="h-3 w-3" />
                                      Visit Site
                                    </Button>
                                    <Button size="sm" variant="outline" className="gap-2 border-emerald-300 hover:bg-emerald-100">
                                      <RotateCcw className="h-3 w-3" />
                                      Rollback
                                    </Button>
                                  </div>
                                </div>
                              </div>

                              {/* Live URLs */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <Globe className="h-4 w-4" />
                                  Live URLs
                                </h4>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">Production App</div>
                                        <div className="text-xs text-gray-600 font-mono">
                                          https://my-saas-app.com
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                                        Live
                                      </Badge>
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                                    <div className="flex items-center gap-3">
                                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                                      <div>
                                        <div className="text-sm font-medium text-gray-900">API Endpoint</div>
                                        <div className="text-xs text-gray-600 font-mono">
                                          https://api.my-saas-app.com
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex gap-2">
                                      <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                        Live
                                      </Badge>
                                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                                        <ExternalLink className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Terraform Outputs */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <FileText className="h-4 w-4" />
                                  Infrastructure Outputs
                                </h4>
                                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-auto">
                                  <div className="text-green-400 mb-2"># Terraform Apply Output</div>
                                  <div className="text-gray-300">
                                    <div className="text-blue-300">cloudfront_distribution_id</div>
                                    <div className="ml-4 text-yellow-300">= "E1ABCDEF123456"</div>
                                    <div className="text-blue-300 mt-2">s3_bucket_name</div>
                                    <div className="ml-4 text-yellow-300">= "my-saas-app-static-assets"</div>
                                    <div className="text-blue-300 mt-2">api_gateway_url</div>
                                    <div className="ml-4 text-yellow-300">= "https://api.my-saas-app.com"</div>
                                    <div className="text-blue-300 mt-2">ecs_service_name</div>
                                    <div className="ml-4 text-yellow-300">= "my-saas-app-api"</div>
                                  </div>
                                  <div className="text-green-400 mt-4">
                                    Apply complete! Resources: 12 added, 0 changed, 0 destroyed.
                                  </div>
                                </div>
                              </div>

                              {/* Resource Health */}
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                  <Server className="h-4 w-4" />
                                  Resource Health
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                      <span className="text-sm font-medium text-green-900">CloudFront</span>
                                    </div>
                                    <div className="text-xs text-green-700">Healthy • 99.9% uptime</div>
                                  </div>
                                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                      <span className="text-sm font-medium text-green-900">ECS Service</span>
                                    </div>
                                    <div className="text-xs text-green-700">2/2 tasks running</div>
                                  </div>
                                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                      <span className="text-sm font-medium text-green-900">Database</span>
                                    </div>
                                    <div className="text-xs text-green-700">All tables active</div>
                                  </div>
                                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                                    <div className="flex items-center gap-2 mb-1">
                                      <CheckCircle className="h-4 w-4 text-green-600" />
                                      <span className="text-sm font-medium text-green-900">Load Balancer</span>
                                    </div>
                                    <div className="text-xs text-green-700">Healthy targets: 2/2</div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="h-full flex items-center justify-center">
                              <div className="text-center px-6 max-w-md">
                                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                  <Rocket className="w-8 h-8 text-emerald-600" />
                                </div>
                                <div className="text-lg font-semibold text-gray-900 mb-2">Ready to Deploy</div>
                                <div className="text-sm text-gray-600 mb-6">
                                  Deploy your application to production with a single click. Your infrastructure will be provisioned using Terraform.
                                </div>
                                <Button 
                                  onClick={triggerDeploy} 
                                  disabled={!canTrigger} 
                                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 shadow-lg"
                                >
                                  <Rocket className="h-4 w-4" /> Deploy to Production
                                </Button>
                                <div className="text-xs text-gray-500 mt-3">
                                  Includes CloudFront + S3 + ECS + DynamoDB
                                </div>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  </div>
                </Tabs>
              </div>
            </div>
          }
        />
      </div>
    </div>
  );
}




