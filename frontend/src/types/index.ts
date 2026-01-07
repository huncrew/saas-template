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