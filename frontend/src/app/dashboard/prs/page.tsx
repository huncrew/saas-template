"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PRsPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Pull Requests</CardTitle>
          <CardDescription>
            Centralized PR tracking will land shortly. Monitor actions from the Overview page in the meantime.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          Integrations with GitHub checks, status badges, and merge automation will extend this space once the core flow is validated.
        </CardContent>
      </Card>
    </div>
  );
}
