"use client";

export function FactoryDevBanner() {
  const devNoAuth =
    typeof window !== "undefined" &&
    (process.env.NEXT_PUBLIC_FACTORY_DEV_NO_AUTH === "1" ||
      process.env.NEXT_PUBLIC_FACTORY_DEV_NO_AUTH === "true");

  if (!devNoAuth) return null;

  return (
    <div className="border-b bg-amber-50">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-2 text-xs text-amber-900 flex items-center justify-between gap-4">
        <div className="min-w-0 truncate">
          <span className="font-medium">Dev mode:</span> auth bypass enabled
        </div>
        <div className="hidden sm:flex items-center gap-3 text-amber-800">
          {process.env.NEXT_PUBLIC_API_BASE_URL ? (
            <span className="truncate">API: {process.env.NEXT_PUBLIC_API_BASE_URL}</span>
          ) : null}
          {process.env.NEXT_PUBLIC_ORCHESTRATOR_API_URL ? (
            <span className="truncate">Orchestrator: {process.env.NEXT_PUBLIC_ORCHESTRATOR_API_URL}</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}






