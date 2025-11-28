"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, Sparkles, Compass, Layers, Workflow, Gauge } from "lucide-react";

const links = [
  { label: "Platform", href: "#platform" },
  { label: "Agents", href: "#agents" },
  { label: "Workflow", href: "#workflow" },
  { label: "Integrations", href: "#integrations" },
];

export function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        isScrolled
          ? "bg-slate-950/90 backdrop-blur-xl border-b border-slate-800/60 shadow-[0_8px_30px_rgba(15,23,42,0.35)]"
          : "bg-slate-950/60 backdrop-blur-lg"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-emerald-500 shadow-lg shadow-cyan-500/25">
            <Sparkles className="h-4 w-4 text-slate-950" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm uppercase tracking-[0.2em] text-slate-300">
              CloudOps
            </span>
            <span className="text-lg font-semibold text-white">Agent Studio</span>
          </div>
        </Link>

        <div className="ml-auto hidden items-center gap-10 rounded-full border border-slate-800/60 bg-slate-900/60 px-8 py-2 lg:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto hidden items-center gap-3 lg:flex">
          <Button variant="ghost" className="text-slate-300 hover:text-white" asChild>
            <Link href="/dashboard">Sign In</Link>
          </Button>
          <Button
            className="bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/40 hover:from-cyan-300 hover:to-emerald-300"
            asChild
          >
            <Link href="/dashboard">Launch Console</Link>
          </Button>
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-10 w-10 text-slate-200 lg:hidden"
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
        >
          {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </Button>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-slate-800/60 bg-slate-950/95 backdrop-blur-xl lg:hidden">
          <div className="space-y-1 px-4 py-4">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-slate-200 hover:bg-slate-900"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900/80">
                  {link.href.includes("platform") && <Compass className="h-4 w-4" />}
                  {link.href.includes("agents") && <Layers className="h-4 w-4" />}
                  {link.href.includes("workflow") && <Workflow className="h-4 w-4" />}
                  {link.href.includes("integrations") && <Gauge className="h-4 w-4" />}
                </span>
                {link.label}
              </Link>
            ))}
            <div className="mt-3 grid gap-2">
              <Button variant="ghost" className="justify-start text-slate-300" asChild>
                <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                  Sign In
                </Link>
              </Button>
              <Button
                className="bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-cyan-500/30"
                asChild
              >
                <Link href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>
                  Launch Console
                </Link>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}