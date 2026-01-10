"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, LayoutGrid } from "lucide-react";

type Props = {
  storageKey?: string;
  minLeftPx?: number;
  maxLeftPx?: number;
  defaultLeftPx?: number;
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
};

type MobileTab = "chat" | "workspace";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ResizableSplit({
  storageKey = "factory.split.leftPx",
  minLeftPx = 360,
  maxLeftPx = 720,
  defaultLeftPx = 440,
  left,
  right,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);
  const [leftPx, setLeftPx] = useState<number>(defaultLeftPx);
  const [mobileTab, setMobileTab] = useState<MobileTab>("chat");

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      setLeftPx(clamp(parsed, minLeftPx, maxLeftPx));
    } catch {
      // ignore
    }
  }, [maxLeftPx, minLeftPx, storageKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, String(leftPx));
    } catch {
      // ignore
    }
  }, [leftPx, storageKey]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const next = clamp(e.clientX - rect.left, minLeftPx, maxLeftPx);
      setLeftPx(next);
    }
    function onUp() {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [maxLeftPx, minLeftPx]);

  const gridStyle = useMemo<React.CSSProperties>(
    () => ({
      gridTemplateColumns: `${leftPx}px 1px 1fr`,
    }),
    [leftPx]
  );

  return (
    <div ref={containerRef} className={className}>
      <div className="hidden h-full lg:grid" style={gridStyle}>
        <div className="h-full min-w-0">{left}</div>
        <div className="h-full bg-border" />
        <div className="h-full min-w-0">{right}</div>

        <div
          className="absolute top-0 h-full w-2 -translate-x-1/2 cursor-col-resize"
          style={{ left: leftPx }}
          onMouseDown={() => {
            draggingRef.current = true;
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        >
          <div className="mx-auto h-full w-px bg-transparent hover:bg-emerald-400/70" />
        </div>
      </div>

      {/* Mobile/Tablet: Full-screen tab-based view */}
      <div className="lg:hidden h-full flex flex-col bg-white">
        {/* Content area - full screen for selected tab */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {mobileTab === "chat" ? (
            <div className="h-full flex flex-col">
              {/* Chat content with bottom padding for tab bar */}
              <div className="flex-1 min-h-0 pb-0">{left}</div>
            </div>
          ) : (
            <div className="h-full overflow-auto">{right}</div>
          )}
        </div>

        {/* Bottom tab bar - sleeker design */}
        <div className="flex-shrink-0 border-t border-gray-200 bg-white safe-area-bottom shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
          <div className="flex">
            <button
              onClick={() => setMobileTab("chat")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-4 transition-all ${
                mobileTab === "chat"
                  ? "text-emerald-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${mobileTab === "chat" ? "bg-emerald-100" : ""}`}>
                <MessageSquare className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">Chat</span>
            </button>
            <button
              onClick={() => setMobileTab("workspace")}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 px-4 transition-all ${
                mobileTab === "workspace"
                  ? "text-emerald-600"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition-colors ${mobileTab === "workspace" ? "bg-emerald-100" : ""}`}>
                <LayoutGrid className="h-5 w-5" />
              </div>
              <span className="text-[10px] font-medium">Workspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}





