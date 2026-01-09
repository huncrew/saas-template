import { APIResponse, SubscriptionStatus, User } from '@/types';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || '';

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
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'API request failed');
      }
      
      return data;
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
  async createCheckoutSession(priceId: string, userId?: string): Promise<APIResponse<{ clientSecret: string }>> {
    return this.request<{ clientSecret: string }>('/stripe/checkout', {
      method: 'POST',
      body: JSON.stringify({ priceId, userId }),
    });
  }
}

export const apiClient = new ApiClient();
