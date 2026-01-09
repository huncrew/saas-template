"use client";

import Link from "next/link";
import { DashboardLayout } from "@/components/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Dashboard() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="text-xs font-mono text-gray-500">base-skeleton</div>
        <h1 className="mt-3 text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          This page is intentionally minimal. Modules add real functionality (auth, billing, data, workflows).
        </p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Getting started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-700">
              <div>1) Add <code className="font-mono">auth-clerk</code> to protect this area.</div>
              <div>2) Add <code className="font-mono">billing-stripe</code> to unlock paid plans.</div>
              <div>3) Define data entities in <code className="font-mono">spec_yaml</code> and generate CRUD.</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <Link href="/pricing">Pricing</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/auth/signin">Sign in</Link>
              </Button>
              <Button asChild>
                <Link href="/">Home</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
