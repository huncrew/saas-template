"use client";

import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/clerk-react";

export function ClerkGate({ children }: { children: ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  if (!publishableKey) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-lg w-full rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-lg font-semibold text-gray-900">Auth not configured</div>
          <div className="mt-2 text-sm text-gray-600">
            Set <code className="font-mono">NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</code> to enable sign-in.
          </div>
        </div>
      </div>
    );
  }

  return <ClerkProvider publishableKey={publishableKey}>{children}</ClerkProvider>;
}



