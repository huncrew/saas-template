import type { APIResponse } from "@/types";
import type { FactoryBuild, FactoryProject, FactoryProjectChatResponse } from "@/types/factory";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<APIResponse<T>> {
  const res = await fetch(endpoint, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = (await res.json()) as APIResponse<T>;
  if (!res.ok) {
    throw new Error(data?.error || "Request failed");
  }
  return data;
}

export const factoryApi = {
  listProjects(): Promise<APIResponse<FactoryProject[]>> {
    return request<FactoryProject[]>("/api/factory/projects", { method: "GET" });
  },
  createProject(input: { name: string; template_id: string }): Promise<APIResponse<FactoryProject>> {
    return request<FactoryProject>("/api/factory/projects", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  getProject(projectId: string): Promise<APIResponse<FactoryProject>> {
    return request<FactoryProject>(`/api/factory/projects/${encodeURIComponent(projectId)}`, { method: "GET" });
  },
  createPreviewBuild(projectId: string): Promise<APIResponse<FactoryBuild>> {
    return request<FactoryBuild>(`/api/factory/projects/${encodeURIComponent(projectId)}/build-preview`, { method: "POST" });
  },
  createDeployBuild(projectId: string): Promise<APIResponse<FactoryBuild>> {
    return request<FactoryBuild>(`/api/factory/projects/${encodeURIComponent(projectId)}/deploy`, { method: "POST" });
  },
  getBuild(buildId: string): Promise<APIResponse<FactoryBuild>> {
    return request<FactoryBuild>(`/api/factory/builds/${encodeURIComponent(buildId)}`, { method: "GET" });
  },
  chatProject(projectId: string, input: { message: string; auto_preview?: boolean }): Promise<APIResponse<FactoryProjectChatResponse>> {
    return request<FactoryProjectChatResponse>(`/api/factory/projects/${encodeURIComponent(projectId)}/chat`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};




