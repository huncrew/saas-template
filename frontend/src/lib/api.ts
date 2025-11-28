import {
  APIResponse,
  AgentActionRequestPayload,
  AgentActionResponsePayload,
  AgentChatPayload,
  AgentChatResult,
  AgentDefinition,
  AgentDefinitionCreatePayload,
  AgentDefinitionUpdatePayload,
  AgentMemoryEntry,
  AgentToolDefinition,
  AgentTrainingJob,
  AgentVersion,
  CloudAccount,
  CloudAction,
  CloudFinding,
  FeedbackExamplePayload,
  IngestResponsePayload,
  SaveFeedbackResponse,
  SubscriptionStatus,
  TrainingJobCreatePayload,
  TrainingJobListResponse,
  TrainingJobResponse,
  User,
} from '@/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  'https://0f8597zelg.execute-api.us-east-1.amazonaws.com/dev';

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<APIResponse<T>> {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const text = await response.text();
      let data: unknown = {};

      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      
      if (!response.ok) {
        let errorMessage = 'API request failed';
        if (typeof data === 'object' && data !== null) {
          if ('detail' in data && typeof (data as Record<string, unknown>).detail === 'string') {
            errorMessage = (data as Record<string, string>).detail;
          } else if ('error' in data && typeof (data as Record<string, unknown>).error === 'string') {
            errorMessage = (data as Record<string, string>).error;
          } else if ('message' in data && typeof (data as Record<string, unknown>).message === 'string') {
            errorMessage = (data as Record<string, string>).message;
          }
        }
        throw new Error(errorMessage);
      }

      if (typeof data === 'object' && data !== null && 'success' in data) {
        return data as APIResponse<T>;
      }

      return {
        success: true,
        data: data as T,
      };
    } catch (error) {
      console.error('API request error:', error);
      throw error;
    }
  }

  // Auth methods
  async getUser(userId: string): Promise<APIResponse<User>> {
    return this.request<User>('/auth/session', {
      method: 'POST',
      body: JSON.stringify({
        action: 'getUser',
        userId,
      }),
    });
  }

  async createUser(userData: Partial<User>): Promise<APIResponse<User>> {
    return this.request<User>('/auth/session', {
      method: 'POST',
      body: JSON.stringify({
        action: 'createUser',
        userData,
      }),
    });
  }

  // Subscription methods
  async getSubscriptionStatus(userId: string): Promise<APIResponse<SubscriptionStatus>> {
    return this.request<SubscriptionStatus>(`/subscription/status?userId=${userId}`);
  }

  // Stripe methods
  async createCheckoutSession(priceId: string): Promise<APIResponse<{ clientSecret: string }>> {
    return this.request<{ clientSecret: string }>('/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId }),
    });
  }

  // CloudOps endpoints
  async ingestAccount(payload: {
    accountId: string;
    organizationId?: string;
    regions?: string[];
    metadata?: Record<string, string>;
  }): Promise<APIResponse<IngestResponsePayload>> {
    return this.request<IngestResponsePayload>('/ingest', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async agentChat(payload: AgentChatPayload): Promise<APIResponse<AgentChatResult>> {
    return this.request<AgentChatResult>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async triggerAgentAction(
    payload: AgentActionRequestPayload,
  ): Promise<APIResponse<AgentActionResponsePayload>> {
    return this.request<AgentActionResponsePayload>('/agent/action', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listFindings(accountId: string): Promise<CloudFinding[]> {
    const response = await this.request<CloudFinding[]>(`/findings?accountId=${accountId}`);
    return (response.data ?? []) as CloudFinding[];
  }

  async listActions(accountId: string): Promise<CloudAction[]> {
    const response = await this.request<CloudAction[]>(`/actions?accountId=${accountId}`);
    return (response.data ?? []) as CloudAction[];
  }

  async listAgents(): Promise<AgentDefinition[]> {
    const response = await this.request<AgentDefinition[]>('/agents');
    return (response.data ?? []) as AgentDefinition[];
  }

  async createAgentDefinition(
    payload: AgentDefinitionCreatePayload,
  ): Promise<AgentDefinition> {
    const response = await this.request<AgentDefinition>('/agents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.data) {
      throw new Error('Failed to create agent');
    }
    return response.data;
  }

  async getAgentDefinition(agentId: string): Promise<AgentDefinition> {
    const response = await this.request<AgentDefinition>(`/agents/${agentId}`);
    if (!response.data) {
      throw new Error('Agent not found');
    }
    return response.data;
  }

  async updateAgentDefinition(
    agentId: string,
    payload: AgentDefinitionUpdatePayload,
  ): Promise<AgentDefinition> {
    const response = await this.request<AgentDefinition>(`/agents/${agentId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!response.data) {
      throw new Error('Failed to update agent');
    }
    return response.data;
  }

  async publishAgentDefinition(agentId: string): Promise<AgentDefinition> {
    const response = await this.request<AgentDefinition>(`/agents/${agentId}/publish`, {
      method: 'POST',
    });
    if (!response.data) {
      throw new Error('Failed to publish agent');
    }
    return response.data;
  }

  async listAgentVersions(agentId: string): Promise<AgentVersion[]> {
    const response = await this.request<AgentVersion[]>(`/agents/${agentId}/versions`);
    return (response.data ?? []) as AgentVersion[];
  }

  async listAgentMemory(agentId: string, accountId: string): Promise<AgentMemoryEntry[]> {
    const response = await this.request<AgentMemoryEntry[]>(
      `/agents/${agentId}/memory?accountId=${accountId}`,
    );
    return (response.data ?? []) as AgentMemoryEntry[];
  }

  async listAgentTools(): Promise<AgentToolDefinition[]> {
    const response = await this.request<AgentToolDefinition[]>('/agents/tools');
    return (response.data ?? []) as AgentToolDefinition[];
  }

  async listAgentTrainingJobs(agentId: string): Promise<AgentTrainingJob[]> {
    const response = await this.request<TrainingJobListResponse>(`/agents/${agentId}/train`);
    return response.data?.jobs ?? [];
  }

  async startAgentTraining(
    agentId: string,
    payload: TrainingJobCreatePayload,
  ): Promise<AgentTrainingJob> {
    const response = await this.request<TrainingJobResponse>(`/agents/${agentId}/train`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.data) {
      throw new Error('Training job did not return a payload');
    }
    return response.data.job;
  }

  async submitAgentFeedback(
    agentId: string,
    payload: FeedbackExamplePayload,
  ): Promise<SaveFeedbackResponse> {
    const response = await this.request<SaveFeedbackResponse>(
      `/agents/${agentId}/wa-feedback`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
    if (!response.data) {
      throw new Error('Failed to save feedback example');
    }
    return response.data;
  }

  async listAccounts(): Promise<CloudAccount[]> {
    const response = await this.request<CloudAccount[]>('/accounts');
    return (response.data ?? []) as CloudAccount[];
  }
}

export const apiClient = new ApiClient();