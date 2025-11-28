"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  LayoutDashboard,
  BrainCircuit,
  ShieldCheck,
  GitPullRequest,
  HelpCircle,
  BookOpen,
  Search,
} from "lucide-react";

const navigation = [
  { label: "Playground", href: "/dashboard", icon: LayoutDashboard },
  { label: "Agents", href: "/dashboard/agents", icon: BrainCircuit },
  { label: "Findings", href: "/dashboard/findings", icon: ShieldCheck },
  { label: "PR Activity", href: "/dashboard/prs", icon: GitPullRequest },
];

interface CloudOpsShellProps {
  children: React.ReactNode;
}

export default function CloudOpsShell({ children }: CloudOpsShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
          <Link href="/" className="flex items-center gap-3 px-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-emerald-400 text-slate-950 shadow-lg shadow-cyan-500/25">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">CloudOps</p>
              <p className="text-lg font-semibold text-slate-900">Agent Studio</p>
            </div>
          </Link>

          <nav className="mt-8 flex-1 space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition",
                    isActive
                      ? "bg-slate-900 text-white shadow-inner shadow-cyan-500/10"
                      : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-2 border-t border-slate-200 pt-4">
            <Button variant="ghost" className="w-full justify-start text-slate-600 hover:text-slate-900" asChild>
              <Link href="/help">
                <HelpCircle className="mr-2 h-4 w-4" />
                Support
              </Link>
            </Button>
            <Button variant="ghost" className="w-full justify-start text-slate-600 hover:text-slate-900" asChild>
              <Link href="/docs">
                <BookOpen className="mr-2 h-4 w-4" />
                Docs
              </Link>
            </Button>
          </div>
        </aside>

        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur-xl">
            <div className="flex h-16 w-full items-center gap-4 px-6">
              <div className="flex-1">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search agents, accounts, tool runs…"
                    className="w-full rounded-2xl border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                </div>
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <Button variant="ghost" className="text-slate-600 hover:text-slate-900" asChild>
                  <Link href="/help">
                    <HelpCircle className="mr-2 h-4 w-4" />
                    Support
                  </Link>
                </Button>
                <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100" asChild>
                  <Link href="/docs">
                    <BookOpen className="mr-2 h-4 w-4" />
                    Docs
                  </Link>
                </Button>
                <Button className="bg-gradient-to-r from-cyan-400 to-emerald-400 text-slate-950 shadow-cyan-500/30 hover:from-cyan-300 hover:to-emerald-300" asChild>
                  <Link href="/dashboard">Open Playground</Link>
                </Button>
              </div>
            </div>
          </header>

          <main className="flex-1 bg-slate-50 px-6 py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}