"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X } from "lucide-react";

export function Navigation() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Base Skeleton
          </Link>

          <div className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/dashboard" className="text-gray-700 hover:text-gray-900">
              Dashboard
            </Link>
            <Link href="/pricing" className="text-gray-700 hover:text-gray-900">
              Pricing
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/signin">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/signup">Create account</Link>
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {isMobileMenuOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link
              href="/dashboard"
              className="block text-sm text-gray-700 hover:text-gray-900"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/pricing"
              className="block text-sm text-gray-700 hover:text-gray-900"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Pricing
            </Link>
            <div className="pt-2 flex gap-2">
              <Button variant="outline" size="sm" asChild className="flex-1">
                <Link href="/auth/signin" onClick={() => setIsMobileMenuOpen(false)}>
                  Sign in
                </Link>
              </Button>
              <Button size="sm" asChild className="flex-1">
                <Link href="/auth/signup" onClick={() => setIsMobileMenuOpen(false)}>
                  Create account
                </Link>
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}