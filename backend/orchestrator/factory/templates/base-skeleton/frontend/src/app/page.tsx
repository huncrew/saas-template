import Link from "next/link";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <div className="text-xs font-mono text-gray-500">base-skeleton</div>
          <h1 className="mt-3 text-3xl font-semibold text-gray-900">
            Minimal starter app
          </h1>
          <p className="mt-3 text-gray-600">
            This is a clean base skeleton. The Factory composes real features by applying module patches and/or AI-generated diffs.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/pricing">View pricing</Link>
            </Button>
          </div>

          <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <div className="font-medium">Try this</div>
            <ul className="mt-2 list-disc pl-5 space-y-1">
              <li>Chat: “No modules. Todo app… Build preview.”</li>
              <li>Then iterate with small diffs until it looks right.</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
