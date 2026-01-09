"use client";

import { useEffect, useRef, useState } from "react";

interface MermaidDiagramProps {
  chart: string;
  className?: string;
}

/**
 * Renders a Mermaid diagram from a chart definition string.
 *
 * Uses dynamic import to load mermaid only on the client side.
 */
export function MermaidDiagram({ chart, className = "" }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!chart || !containerRef.current) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function renderDiagram() {
      try {
        // Dynamically import mermaid
        const mermaid = (await import("mermaid")).default;

        if (cancelled) return;

        // Initialize mermaid with config
        mermaid.initialize({
          startOnLoad: false,
          theme: "neutral",
          securityLevel: "loose",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
            curve: "basis",
          },
          er: {
            useMaxWidth: true,
          },
        });

        // Generate unique ID for the diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;

        // Render the diagram
        const { svg } = await mermaid.render(id, chart);

        if (cancelled || !containerRef.current) return;

        // Insert the SVG
        containerRef.current.innerHTML = svg;
        setError(null);
      } catch (err) {
        console.error("Mermaid render error:", err);
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to render diagram");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (!chart) {
    return (
      <div className={`flex items-center justify-center p-8 text-gray-500 ${className}`}>
        No diagram available
      </div>
    );
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="text-sm font-medium text-red-700 mb-2">Failed to render diagram</div>
        <div className="text-xs text-red-600 font-mono">{error}</div>
        <details className="mt-2">
          <summary className="text-xs text-red-600 cursor-pointer">Show raw chart</summary>
          <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-auto max-h-40">
            {chart}
          </pre>
        </details>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50/80">
          <div className="flex items-center gap-2 text-gray-600">
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Rendering diagram...</span>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="w-full overflow-auto [&_svg]:mx-auto [&_svg]:max-w-full"
      />
    </div>
  );
}
