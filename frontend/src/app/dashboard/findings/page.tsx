"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function FindingsPage() {
  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Findings Explorer</CardTitle>
          <CardDescription>
            A dedicated view for triaging findings across accounts is on the roadmap. For now, use the Overview page feed.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-gray-600">
          Filterable, multi-account findings dashboards will arrive soon. Share feedback in the project README if you have preferred workflows.
        </CardContent>
      </Card>
    </div>
  );
}
