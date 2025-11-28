import { apiClient } from './api';
import { APIResponse } from '@/types';

export interface AIRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface AIResponse {
  response: string;
  model: string;
  tokens: number;
  requestId: string;
}

export interface AISession {
  id: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  createdAt: string;
}

class AIService {
  async generateResponse(request: AIRequest, userId?: string): Promise<APIResponse<AIResponse>> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          userId,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'AI request failed');
      }
      
      return data;
    } catch (error) {
      console.error('AI service error:', error);
      throw error;
    }
  }

  async getHistory(userId: string): Promise<APIResponse<AISession[]>> {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/ai/history?userId=${userId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get AI history');
      }
      
      return data;
    } catch (error) {
      console.error('AI history service error:', error);
      throw error;
    }
  }
}

export const aiService = new AIService();