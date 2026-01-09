export type BuildType = "preview" | "deploy";
export type BuildStatus = "queued" | "running" | "failed" | "succeeded";

export interface FactoryProject {
  project_id: string;
  name: string;
  template_id: string; // e.g. "saas-crud"
  created_at: string;
  last_build_id?: string;
  status?: string;
  spec_yaml?: string;
  spec_markdown?: string;
  spec_updated_at?: string;
}

export interface FactorySpec {
  goal?: string;
  target_users?: string[];
  modules?: string[];
  features?: Array<{
    id: string;
    name: string;
    description?: string;
    ui_components?: string[];
    api_endpoints?: string[];
    data_models?: string[];
  }>;
  data_entities?: Array<{
    name: string;
    description?: string;
    fields?: Array<{
      name: string;
      type: string;
    }>;
  }>;
  api_endpoints?: Array<{
    method: string;
    path: string;
    description?: string;
  }>;
  ui_pages?: Array<{
    path: string;
    name: string;
    components?: string[];
  }>;
  integrations?: string[];
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




