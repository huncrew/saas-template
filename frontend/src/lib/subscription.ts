import { Subscription, PricingPlan } from '@/types';

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 29,
    interval: 'month',
    stripePriceId: 'price_starter_monthly', // Replace with actual Stripe price ID
    features: [
      'Up to 1,000 API calls/month',
      'Basic analytics dashboard',
      'Email support',
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 99,
    interval: 'month',
    stripePriceId: 'price_professional_monthly', // Replace with actual Stripe price ID
    popular: true,
    features: [
      'Up to 10,000 API calls/month',
      'Advanced analytics & insights',
      'Priority support',
      'Custom integrations',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 0, // Custom pricing
    interval: 'month',
    stripePriceId: 'price_enterprise_monthly', // Replace with actual Stripe price ID
    features: [
      'Unlimited API calls',
      'White-label solution',
      'Dedicated support manager',
      'Custom deployment',
    ],
  },
];

export function isSubscriptionActive(subscription?: Subscription): boolean {
  if (!subscription) return false;
  
  return subscription.status === 'active' && 
         new Date(subscription.currentPeriodEnd) > new Date();
}

export function getSubscriptionPlan(planId: string): PricingPlan | undefined {
  return PRICING_PLANS.find(plan => plan.id === planId);
}

export function formatSubscriptionStatus(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Past Due';
    case 'cancelled':
      return 'Cancelled';
    case 'incomplete':
      return 'Incomplete';
    default:
      return 'Inactive';
  }
}