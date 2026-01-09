"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  storageKey?: string;
  minLeftPx?: number;
  maxLeftPx?: number;
  defaultLeftPx?: number;
  left: React.ReactNode;
  right: React.ReactNode;
  className?: string;
};

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

      <div className="lg:hidden h-full">
        {/* Mobile: Give chat slightly more space (55/45 split) */}
        <div className="h-full grid grid-rows-[minmax(0,55fr)_minmax(0,45fr)]">
          <div className="min-h-0 overflow-hidden border-b border-gray-200">{left}</div>
          <div className="min-h-0 overflow-hidden">{right}</div>
        </div>
      </div>
    </div>
  );
}





