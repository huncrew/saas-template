"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckoutForm } from "@/components/checkout-form";
import { PricingPlan } from "@/types";
import { Check } from "lucide-react";

interface PricingCardProps {
  plan: PricingPlan;
  userId?: string;
  currentPlan?: string;
}

export function PricingCard({ plan, userId, currentPlan }: PricingCardProps) {
  const [showCheckout, setShowCheckout] = useState(false);
  const isCurrentPlan = currentPlan === plan.id;
  const isEnterprise = plan.id === 'enterprise';

  if (showCheckout && !isEnterprise) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Subscribe to {plan.name}</h3>
          <Button variant="outline" onClick={() => setShowCheckout(false)}>
            Back
          </Button>
        </div>
        <CheckoutForm priceId={plan.stripePriceId} userId={userId} />
      </div>
    );
  }

  return (
    <Card className={`relative ${plan.popular ? 'border-blue-500 border-2' : 'border-gray-200'}`}>
      {plan.popular && (
        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
          <span className="bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}
      
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{plan.name}</CardTitle>
        <div className="text-4xl font-bold text-gray-900 mt-4">
          {plan.price === 0 ? (
            'Custom'
          ) : (
            <>
              ${plan.price}
              <span className="text-lg font-normal text-gray-600">/{plan.interval}</span>
            </>
          )}
        </div>
        <CardDescription>
          {isEnterprise 
            ? 'For large organizations with specific needs'
            : plan.id === 'starter' 
              ? 'Perfect for small teams getting started'
              : 'For growing businesses that need more power'
          }
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        <ul className="space-y-3 mb-6">
          {plan.features.map((feature, index) => (
            <li key={index} className="flex items-center">
              <Check className="h-5 w-5 text-green-600 mr-3 flex-shrink-0" />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
        
        <Button 
          className="w-full" 
          variant={plan.popular ? "default" : "outline"}
          disabled={isCurrentPlan}
          onClick={() => {
            if (isEnterprise) {
              // Handle enterprise contact
              window.location.href = 'mailto:sales@example.com';
            } else {
              setShowCheckout(true);
            }
          }}
        >
          {isCurrentPlan 
            ? 'Current Plan' 
            : isEnterprise 
              ? 'Contact Sales' 
              : 'Get Started'
          }
        </Button>
      </CardContent>
    </Card>
  );
}