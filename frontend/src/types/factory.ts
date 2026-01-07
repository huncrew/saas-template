export type BuildType = "preview" | "deploy";
export type BuildStatus = "queued" | "running" | "failed" | "succeeded";

export interface FactoryProject {
  project_id: string;
  name: string;
  template_id: string; // e.g. "saas-crud"
  created_at: string;
  last_build_id?: string;
  status?: string;
}

export interface FactoryBuildArtifacts {
  repo_ref?: string;
  preview_url?: string;
  deploy_urls?: string[];
  logs_url?: string;
  tf_plan_url?: string;
  checks_report_url?: string;
  architecture_url?: string;
  changes_url?: string;
}

export interface FactoryBuild {
  build_id: string;
  project_id: string;
  type: BuildType;
  status: BuildStatus;
  started_at?: string;
  finished_at?: string;
  artifacts?: FactoryBuildArtifacts;
  error?: string;
}

export type FactoryChatSuggestedAction = "ask_followups" | "build_preview" | "noop";

export interface FactoryChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface FactoryProjectChatResponse {
  assistant: FactoryChatMessage;
  followups: string[];
  suggested_action: FactoryChatSuggestedAction;
  plan?: string | null;
}




