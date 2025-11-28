export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  subscriptionStatus: 'active' | 'inactive' | 'cancelled';
  subscriptionId?: string;
  cognitoId: string;
}

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  status: 'active' | 'past_due' | 'cancelled' | 'incomplete';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  planId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId: string;
  popular?: boolean;
}

export interface APIResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface SubscriptionStatus {
  subscription?: Subscription;
  subscriptionStatus: 'active' | 'inactive' | 'cancelled';
  hasActiveSubscription: boolean;
}

export type CloudAgentType =
  | 'WellArchitectedAgent'
  | 'CostAgent'
  | 'AIWorkflowAgent'
  | 'RetrievalAgent'
  | 'Custom';

export type AgentBackend = 'langgraph' | 'agentcore';

export interface ProposedChange {
  type: 'terraform_patch' | 'config_patch' | 'direct_change';
  target: string;
  patch: string;
}

export interface ProposedAction {
  id: string;
  kind: 'terraform_pr' | 'config_pr' | 'direct_change';
  title: string;
  rationale: string;
  impactedResources: string[];
  changes: ProposedChange[];
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  rollback: string;
  estCostDeltaUsdMonth: number;
}

export interface CloudFinding {
  account_id: string;
  finding_id: string;
  agent_type: CloudAgentType;
  title: string;
  description: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  proposed_actions: ProposedAction[];
  created_at?: string;
  updated_at?: string;
}

export interface CloudAction {
  account_id: string;
  action_id: string;
  mode: 'PR' | 'DIRECT' | 'CODE';
  status: 'CREATED' | 'APPLIED' | 'FAILED' | 'COMPLETED';
  details: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface CloudAccount {
  account_id: string;
  org_id?: string;
  account_name?: string;
  last_snapshot_s3?: string;
  last_ingest_at?: string;
  metadata?: Record<string, string>;
}

export interface IngestResponsePayload {
  snapshotS3Uri: string;
  resourceCounts: Record<string, number>;
  costSummary: Record<string, number>;
}

export interface ToolInvocationPayload {
  name: string;
  args?: Record<string, unknown>;
}

export interface AgentChatPayload {
  accountId: string;
  agentType: CloudAgentType;
  message: string;
  context?: Record<string, unknown>;
  conversation?: AgentMessage[];
  toolInvocations?: ToolInvocationPayload[];
  backend?: AgentBackend;
  agentId?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentChatResult {
  reply: string;
  findings: Array<Record<string, string>>;
  proposedActions: ProposedAction[];
  tools?: ToolExecution[];
}

export type AgentStatus = 'draft' | 'published';

export interface AgentDefinition {
  agentId: string;
  name: string;
  description: string;
  basePrompt: string;
  allowedTools: string[];
  backend: AgentBackend;
  directChangeAllowed: boolean;
  requireApproval: boolean;
  status: AgentStatus;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  agentcoreAgentId?: string | null;
  agentcoreAgentAliasId?: string | null;
  modelEndpoint?: string | null;
  modelProvider?: string | null;
  modelVersion?: string | null;
  modelStatus?: string | null;
  modelArtifactUri?: string | null;
}

export interface AgentDefinitionCreatePayload {
  name: string;
  description?: string;
  basePrompt?: string;
  allowedTools?: string[];
  backend?: AgentBackend;
  directChangeAllowed?: boolean;
  requireApproval?: boolean;
  agentcoreAgentId?: string;
  agentcoreAgentAliasId?: string;
  modelEndpoint?: string;
  modelProvider?: string;
  modelVersion?: string;
  modelStatus?: string;
  modelArtifactUri?: string;
}

export interface AgentDefinitionUpdatePayload {
  name?: string;
  description?: string;
  basePrompt?: string;
  allowedTools?: string[];
  backend?: AgentBackend;
  directChangeAllowed?: boolean;
  requireApproval?: boolean;
  agentcoreAgentId?: string;
  agentcoreAgentAliasId?: string;
  modelEndpoint?: string;
  modelProvider?: string;
  modelVersion?: string;
  modelStatus?: string;
  modelArtifactUri?: string;
}

export interface AgentVersion {
  agentId: string;
  version: number;
  publishedAt?: string;
  definition: AgentDefinition;
}

export interface AgentMemoryEntry {
  agentId: string;
  accountId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
}

export interface AgentActionRequestPayload {
  accountId: string;
  actionId: string;
  mode: 'PR' | 'DIRECT';
  metadata?: Record<string, string>;
}

export interface AgentActionResponsePayload {
  status: 'CREATED' | 'APPLIED' | 'FAILED';
  message: string;
  details: Record<string, unknown>;
}

export type ToolExecutionStatus = 'success' | 'error' | 'pending_confirmation';

export interface ToolExecution {
  tool: string;
  status: ToolExecutionStatus;
  data?: Record<string, unknown>;
  error?: string;
}

export type TrainingJobStatus = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface AgentTrainingJob {
  jobId: string;
  agentId: string;
  status: TrainingJobStatus;
  provider: string;
  baseModelId?: string | null;
  domainAdaptation?: boolean;
  modelEndpoint?: string | null;
  modelVersion?: string | null;
  artifactUri?: string | null;
  outputLocation?: string | null;
  trainingDataUri?: string | null;
  jobArn?: string | null;
  failureReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrainingJobResponse {
  job: AgentTrainingJob;
}

export interface TrainingJobListResponse {
  jobs: AgentTrainingJob[];
}

export interface TrainingJobCreatePayload {
  baseModelId?: string;
  provider?: 'sagemaker' | 'bedrock';
  domainAdaptation?: boolean;
  notes?: string;
}

export interface FeedbackExamplePayload {
  input: string;
  output: string;
}

export interface SaveFeedbackResponse {
  status: 'SAVED';
  s3Key: string;
}