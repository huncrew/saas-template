"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function AuthErrorInner() {
  const params = useSearchParams();
  const error = params.get("error") || "Configuration";
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Auth configuration error</h2>
        <p className="text-sm text-gray-600 mt-1">
          The server is missing required auth environment variables.
        </p>
      </div>

      <div className="rounded-md border bg-gray-50 p-3 text-sm text-gray-700">
        <div className="font-medium">Error</div>
        <div className="mt-1 font-mono">{error}</div>
      </div>

      <div className="space-y-2 text-sm text-gray-700">
        <div className="font-medium">Required (Clerk)</div>
        <ul className="list-disc pl-5">
          <li>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY</li>
          <li>CLERK_SECRET_KEY</li>
          <li>CLERK_SIGN_IN_URL (recommended)</li>
          <li>CLERK_SIGN_UP_URL (recommended)</li>
          <li>CLERK_AFTER_SIGN_IN_URL (recommended)</li>
          <li>CLERK_AFTER_SIGN_UP_URL (recommended)</li>
        </ul>
      </div>

      <div className="flex items-center gap-3">
        <Button asChild>
          <Link href="/auth/signin">Back to sign in</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-600">Loading…</div>}>
      <AuthErrorInner />
    </Suspense>
  );
}


