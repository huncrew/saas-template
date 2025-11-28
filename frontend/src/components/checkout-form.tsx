"use client";

import { useCallback, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckoutProvider,
  EmbeddedCheckout,
} from "@stripe/react-stripe-js";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

interface CheckoutFormProps {
  priceId: string;
  userId?: string;
}

export function CheckoutForm({ priceId, userId }: CheckoutFormProps) {
  const [isLoading, setIsLoading] = useState(false);

  const fetchClientSecret = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.createCheckoutSession(priceId);
      
      if (!response.success || !response.data?.clientSecret) {
        throw new Error(response.error || 'Failed to create checkout session');
      }

      return response.data.clientSecret;
    } catch (error) {
      console.error('Error fetching client secret:', error);
      toast.error('Failed to initialize checkout. Please try again.');
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [priceId]);

  const options = { 
    fetchClientSecret,
    onComplete: () => {
      toast.success('Payment successful! Welcome to your new plan.');
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2">Loading checkout...</span>
      </div>
    );
  }

  return (
    <div id="checkout" className="max-w-2xl mx-auto">
      <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}