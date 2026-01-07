"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { factoryApi } from "@/lib/factory-api";
import type { FactoryProject } from "@/types/factory";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { FactoryDevBanner } from "@/components/factory/dev-banner";

export default function ProjectsPage() {
  const { isLoaded } = useAuth();
  const [projects, setProjects] = useState<FactoryProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = useMemo(() => name.trim().length >= 2, [name]);

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
    return () => {
      cancelled = true;
    };
  }, [isLoaded]);

  async function createProject() {
    if (!canCreate || isCreating) return;
    setIsCreating(true);
    try {
      const res = await factoryApi.createProject({ name: name.trim(), template_id: "saas-crud" });
      const created = res.data;
      if (!created) throw new Error("Create project failed");
      toast.success("Project created");
      window.location.href = `/projects/${created.project_id}`;
    } catch (e) {
      console.error(e);
      toast.error("Failed to create project");
      setIsCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <FactoryDevBanner />
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border bg-gray-50 px-3 py-1 text-xs text-gray-700">
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              Factory workspace
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900">Projects</h1>
            <p className="text-sm text-gray-600 max-w-xl">
              Create a project, chat to iterate, then publish a preview and deploy when you&apos;re ready.
            </p>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm w-full sm:w-[420px]">
            <div className="text-sm font-medium text-gray-900">New project</div>
            <div className="mt-1 text-xs text-gray-600">V1 template: <span className="font-medium">saas-crud</span></div>
            <div className="mt-3 flex items-center gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name (e.g. Acme CRM)"
                className="bg-white h-11"
              />
              <Button onClick={createProject} disabled={!canCreate || isCreating} className="gap-2 h-11">
                <Plus className="h-4 w-4" />
                Create
              </Button>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              Tip: keep it short — you can rename later.
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
                <CardDescription>Fetching your projects.</CardDescription>
              </CardHeader>
            </Card>
          ) : projects.length === 0 ? (
            <Card className="sm:col-span-2 lg:col-span-3">
              <CardHeader>
                <CardTitle>No projects yet</CardTitle>
                <CardDescription>Create your first project to open the Lovable-style workspace.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={createProject} disabled={!canCreate || isCreating} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Create project
                </Button>
              </CardContent>
            </Card>
          ) : (
            projects.map((p) => (
              <Card key={p.project_id} className="bg-white hover:shadow-md transition-shadow">
                <CardHeader>
                  <CardTitle className="truncate">{p.name}</CardTitle>
                  <CardDescription className="flex items-center justify-between gap-3">
                    <span className="truncate">Template: {p.template_id}</span>
                    <span className="text-xs text-gray-500">{new Date(p.created_at).toLocaleDateString()}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-4">
                  <div className="min-w-0 text-xs text-gray-500 truncate">ID: {p.project_id}</div>
                  <Button asChild variant="outline" className="gap-2">
                    <Link href={`/projects/${p.project_id}`}>
                      Open <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}




