"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

interface BuildData {
  build_id: string;
  project_id: string;
  status: string;
  type: string;
  started_at?: string;
  finished_at?: string;
  artifacts?: {
    files?: Array<{ path: string; content?: string }>;
    patch_diff?: string;
  };
  spec_yaml?: string;
}

export default function PreviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const buildId = params.buildId as string;

  const [build, setBuild] = useState<BuildData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchBuild = async () => {
      try {
        const res = await fetch(`/api/factory/builds/${buildId}`);
        if (!res.ok) {
          throw new Error(`Build not found: ${res.status}`);
        }
        const data = await res.json();
        setBuild(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load build");
      } finally {
        setLoading(false);
      }
    };

    fetchBuild();
  }, [buildId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p>Loading build preview...</p>
        </div>
      </div>
    );
  }

  if (error || !build) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400 mb-2">Preview Not Available</h1>
          <p className="text-gray-400">{error || "Build data not found"}</p>
          <p className="text-gray-500 mt-4 text-sm">
            Project: {projectId}<br />
            Build: {buildId}
          </p>
        </div>
      </div>
    );
  }

  const files = build.artifacts?.files || [];

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Build Preview</h1>
          <div className="flex gap-4 text-sm text-gray-400">
            <span>Project: {projectId}</span>
            <span>Build: {buildId}</span>
            <span className={`px-2 py-0.5 rounded ${
              build.status === "succeeded" ? "bg-green-900 text-green-300" :
              build.status === "running" ? "bg-yellow-900 text-yellow-300" :
              "bg-gray-700 text-gray-300"
            }`}>
              {build.status}
            </span>
          </div>
        </header>

        {build.status === "running" && (
          <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 mb-6">
            <p className="text-yellow-300">Build is in progress. Refresh to see updates.</p>
          </div>
        )}

        {files.length > 0 ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Generated Files ({files.length})</h2>
            {files.map((file, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg overflow-hidden">
                <div className="bg-gray-700 px-4 py-2 font-mono text-sm text-blue-300">
                  {file.path}
                </div>
                {file.content && (
                  <pre className="p-4 overflow-x-auto text-sm text-gray-300">
                    <code>{file.content}</code>
                  </pre>
                )}
              </div>
            ))}
          </div>
        ) : build.artifacts?.patch_diff ? (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold">Generated Patch</h2>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <pre className="p-4 overflow-x-auto text-sm text-gray-300">
                <code>{build.artifacts.patch_diff}</code>
              </pre>
            </div>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <p className="text-gray-400">No generated files available yet.</p>
            <p className="text-gray-500 text-sm mt-2">
              In production, this page would show the built application.
            </p>
          </div>
        )}

        {build.spec_yaml && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Specification</h2>
            <div className="bg-gray-800 rounded-lg overflow-hidden">
              <pre className="p-4 overflow-x-auto text-sm text-gray-300">
                <code>{build.spec_yaml}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
