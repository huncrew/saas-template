"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/nextjs";
import { Zap, Sparkles, Menu, X, LayoutDashboard } from "lucide-react";

export function Navigation() {
  const { isLoaded } = useAuth();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isScrolled 
        ? 'bg-white/95 backdrop-blur-xl border-b border-gray-200/60 shadow-lg shadow-gray-900/5' 
        : 'bg-white/80 backdrop-blur-md'
    }`}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex items-center h-16">
          {/* Logo - Fixed Left */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/25 group-hover:shadow-emerald-500/40 transition-all duration-300">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                Factory
              </span>
              <div className="flex items-center">
                <Sparkles className="h-4 w-4 text-emerald-500 opacity-60" />
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Links - Absolutely Centered */}
          <div className="hidden lg:flex absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <div className="flex items-center space-x-12 bg-white/60 backdrop-blur-xl px-8 py-3 rounded-full border border-gray-200/60 shadow-lg shadow-gray-900/5">
              <Link 
                href="/projects"
                className="relative text-gray-700 hover:text-emerald-600 transition-all duration-300 font-semibold text-sm group px-4 py-2 rounded-lg hover:bg-emerald-50"
              >
                <span className="flex items-center">
                  <LayoutDashboard className="w-4 h-4 mr-2 opacity-60 group-hover:opacity-100 transition-opacity" />
                  Projects
                </span>
                <span className="absolute inset-x-0 -bottom-1 h-0.5 bg-gradient-to-r from-emerald-500 to-green-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center"></span>
              </Link>
            </div>
          </div>

          {/* Right side - Auth buttons - Fixed Right */}
          <div className="flex items-center space-x-4 ml-auto">
            {!isLoaded ? (
              <div className="h-8 w-8 animate-pulse bg-gray-200 rounded-full" />
            ) : (
              <>
                <SignedIn>
                  <UserButton
                    afterSignOutUrl="/"
                    appearance={{
                      elements: {
                        avatarBox:
                          "h-9 w-9 rounded-full border border-emerald-200 shadow-sm shadow-emerald-500/10",
                      },
                    }}
                  />
                </SignedIn>

                <SignedOut>
                  <div className="hidden sm:flex items-center space-x-3">
                    <Button variant="ghost" className="text-gray-600 hover:text-emerald-600 font-medium" asChild>
                      <Link href="/auth/signin">Sign In</Link>
                    </Button>
                    <Button
                      className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 transition-all duration-300"
                      asChild
                    >
                      <Link href="/projects">Open Factory</Link>
                    </Button>
                  </div>
                </SignedOut>
                
                {/* Mobile menu button */}
                <Button
                  variant="ghost"
                  className="sm:hidden h-9 w-9 p-0"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                >
                  {isMobileMenuOpen ? (
                    <X className="h-5 w-5" />
                  ) : (
                    <Menu className="h-5 w-5" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200/60 bg-white/95 backdrop-blur-xl">
            <div className="px-2 pt-2 pb-6 space-y-1">
              <Link
                href="/projects"
                className="block px-3 py-2 text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-md font-medium transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Projects
              </Link>
              <SignedOut>
                <div className="pt-4 space-y-2">
                  <Button variant="ghost" className="w-full justify-start" asChild>
                    <Link href="/auth/signin" onClick={() => setIsMobileMenuOpen(false)}>
                      Sign In
                    </Link>
                  </Button>
                  <Button
                    className="w-full bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white"
                    asChild
                  >
                    <Link href="/projects" onClick={() => setIsMobileMenuOpen(false)}>
                      Open Factory
                    </Link>
                  </Button>
                </div>
              </SignedOut>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}