"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PricingCard } from "@/components/pricing-card";
import { apiClient } from "@/lib/api";
import { PRICING_PLANS } from "@/lib/subscription";
import { SubscriptionStatus } from "@/types";
import { Lock, Crown } from "lucide-react";

interface SubscriptionGateProps {
  children: React.ReactNode;
  requiredPlan?: string;
  fallback?: React.ReactNode;
}

function useOptionalSession() {
  try {
    const result = useSession?.();
    if (!result) return { data: undefined };
    return result;
  } catch {
    return { data: undefined };
  }
}

export function SubscriptionGate({ 
  children, 
  fallback 
}: SubscriptionGateProps) {
  const sessionResult = useOptionalSession();
  const session = sessionResult?.data;
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showPricing, setShowPricing] = useState(false);

  useEffect(() => {
    async function checkSubscription() {
      if (!session?.user?.id) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await apiClient.getSubscriptionStatus(session.user.id);
        if (response.success && response.data) {
          setSubscriptionStatus(response.data);
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      } finally {
        setIsLoading(false);
      }
    }

    checkSubscription();
  }, [session?.user?.id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // If user has active subscription, show the protected content
  if (subscriptionStatus?.hasActiveSubscription) {
    return <>{children}</>;
  }

  // Show pricing if requested
  if (showPricing) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Choose Your Plan</h2>
          <p className="text-gray-600 mb-6">
            Upgrade to access premium features and unlock your full potential
          </p>
          <Button variant="outline" onClick={() => setShowPricing(false)}>
            Back to Dashboard
          </Button>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {PRICING_PLANS.map((plan) => (
            <PricingCard 
              key={plan.id} 
              plan={plan} 
              userId={session?.user?.id}
            />
          ))}
        </div>
      </div>
    );
  }

  // Show subscription gate fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default subscription gate UI
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-2 border-yellow-200 bg-yellow-50">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-yellow-600" />
          </div>
          <CardTitle className="text-2xl">Premium Feature</CardTitle>
          <CardDescription>
            This feature requires an active subscription to access
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-gray-600">
            Upgrade your account to unlock advanced features, increased limits, 
            and priority support.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => setShowPricing(true)} className="flex items-center">
              <Crown className="mr-2 h-4 w-4" />
              View Plans
            </Button>
            <Button variant="outline" onClick={() => window.history.back()}>
              Go Back
            </Button>
          </div>
          
          <div className="mt-6 p-4 bg-blue-50 rounded-lg">
            <h4 className="font-semibold text-blue-900 mb-2">What you&apos;ll get:</h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• Unlimited API calls</li>
              <li>• Advanced analytics dashboard</li>
              <li>• Priority customer support</li>
              <li>• Custom integrations</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}