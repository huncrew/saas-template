"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { SubscriptionStatus } from "@/types";
import { 
  LayoutDashboard, 
  Brain, 
  TrendingUp, 
  Settings, 
  HelpCircle,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Activity,
  Lock,
  Crown,
  BarChart3,
  Users
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    badge: null,
    premium: false,
  },
  {
    name: "Intelligence",
    href: "/dashboard/intelligence",
    icon: Brain,
    badge: "AI",
    premium: false,
  },
  {
    name: "Advanced Analytics",
    href: "/dashboard/analytics", 
    icon: BarChart3,
    badge: "PRO",
    premium: true,
  },
  {
    name: "Team Management",
    href: "/dashboard/team",
    icon: Users,
    badge: "PRO",
    premium: true,
  },
  {
    name: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    badge: null,
    premium: false,
  },
];

interface NavigationItem {
  name: string;
  href: string;
  icon: any;
  badge: string | null;
  premium: boolean;
}

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const pathname = usePathname();
  const { data: session } = useSession();

  // Auto-collapse on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1280) {
        setSidebarCollapsed(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check subscription status
  useEffect(() => {
    async function checkSubscription() {
      if (!session?.user?.id) return;

      try {
        const response = await apiClient.getSubscriptionStatus(session.user.id);
        if (response.success && response.data) {
          setSubscriptionStatus(response.data);
        }
      } catch (error) {
        console.error('Error checking subscription:', error);
      }
    }

    checkSubscription();
  }, [session?.user?.id]);

  const handlePremiumClick = (e: React.MouseEvent, href: string) => {
    e.preventDefault();
    if (!subscriptionStatus?.hasActiveSubscription) {
      setShowUpgradeModal(true);
    } else {
      window.location.href = href;
    }
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 bg-white/95 backdrop-blur-xl border-r border-gray-200/60 shadow-2xl transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0",
        sidebarCollapsed ? "w-16" : "w-72",
        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Sidebar header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200/60 bg-gradient-to-r from-emerald-500/5 to-green-500/5">
          {!sidebarCollapsed && (
            <Link href="/" className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                <Zap className="h-4 w-4 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                AI Intelligence
              </span>
            </Link>
          )}
          
          {sidebarCollapsed && (
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center mx-auto">
              <Zap className="h-4 w-4 text-white" />
            </div>
          )}
          
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden lg:flex h-8 w-8 p-0 hover:bg-emerald-50"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <ChevronRight className="h-4 w-4 text-gray-600" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-gray-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden h-8 w-8 p-0"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Live status indicator */}
        {!sidebarCollapsed && (
          <div className="px-6 py-3 border-b border-gray-200/60">
            <div className="flex items-center space-x-2 text-xs">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="text-emerald-600 font-medium">Live Data</span>
              </div>
              <div className="flex items-center space-x-2 ml-auto">
                <Activity className="h-3 w-3 text-gray-400" />
                <span className="text-gray-500">99.9% uptime</span>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="mt-6 px-3">
          <div className="space-y-1">
            {navigation.map((item) => {
              const isActive = pathname === item.href;
              const isPremium = item.premium;
              const hasAccess = !isPremium || subscriptionStatus?.hasActiveSubscription;
              
              const linkContent = (
                <>
                  {/* Animated background for active state */}
                  {isActive && hasAccess && (
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/10 to-green-500/10 opacity-50" />
                  )}
                  
                  {/* Green accent strip */}
                  {isActive && hasAccess && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 bg-gradient-to-b from-emerald-500 to-green-600 rounded-r-full shadow-sm" />
                  )}
                  
                  <div className={cn(
                    "flex items-center justify-center w-10 h-10 rounded-lg mr-3 transition-all duration-200 relative",
                    isActive && hasAccess
                      ? "bg-gradient-to-br from-emerald-500 to-green-600 shadow-lg shadow-emerald-500/25" 
                      : isPremium && !hasAccess
                      ? "bg-gradient-to-br from-gray-300 to-gray-400"
                      : "bg-gray-100 group-hover:bg-gray-200"
                  )}>
                    <item.icon className={cn(
                      "h-5 w-5 transition-all duration-200",
                      isActive && hasAccess 
                        ? "text-white" 
                        : isPremium && !hasAccess
                        ? "text-gray-500"
                        : "text-gray-500 group-hover:text-gray-700"
                    )} />
                    {isPremium && !hasAccess && (
                      <Lock className="absolute -top-1 -right-1 h-3 w-3 text-gray-600 bg-white rounded-full p-0.5" />
                    )}
                  </div>
                  
                  {!sidebarCollapsed && (
                    <div className="flex items-center justify-between flex-1">
                      <span className={cn(
                        "relative z-10",
                        isPremium && !hasAccess && "text-gray-500"
                      )}>{item.name}</span>
                      <div className="flex items-center space-x-2">
                        {item.badge && (
                          <span className={cn(
                            "px-2 py-1 text-xs font-medium rounded-full",
                            isActive && hasAccess
                              ? "bg-emerald-600 text-white" 
                              : isPremium && item.badge === "PRO"
                              ? "bg-gradient-to-r from-purple-500 to-indigo-600 text-white"
                              : "bg-gray-200 text-gray-600 group-hover:bg-gray-300"
                          )}>
                            {item.badge}
                          </span>
                        )}
                        {isPremium && !hasAccess && (
                          <Lock className="h-3 w-3 text-gray-500" />
                        )}
                      </div>
                    </div>
                  )}
                </>
              );
              
              if (isPremium && !hasAccess) {
                return (
                  <button
                    key={item.name}
                    onClick={(e) => handlePremiumClick(e, item.href)}
                    className={cn(
                      "group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden w-full text-left",
                      "text-gray-500 hover:bg-gray-50 cursor-pointer"
                    )}
                  >
                    {linkContent}
                  </button>
                );
              }
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "group flex items-center px-3 py-3 text-sm font-medium rounded-xl transition-all duration-200 relative overflow-hidden",
                    isActive
                      ? "bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 shadow-sm border border-emerald-100"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  {linkContent}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Premium upgrade section */}
        {!sidebarCollapsed && !subscriptionStatus?.hasActiveSubscription && (
          <div className="mt-8 mx-3">
            <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-4 border border-purple-100">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-6 h-6 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Crown className="h-3 w-3 text-white" />
                </div>
                <span className="text-sm font-semibold text-purple-900">Unlock Premium</span>
              </div>
              <p className="text-xs text-purple-700 mb-3">
                Access advanced analytics, team management, and priority support
              </p>
              <Button 
                size="sm" 
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white shadow-lg"
                onClick={() => setShowUpgradeModal(true)}
              >
                <Crown className="h-3 w-3 mr-1" />
                Upgrade Now
              </Button>
            </div>
          </div>
        )}

        {/* Bottom section */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200/60 bg-gradient-to-r from-gray-50/50 to-white/50">
          <Button
            variant="ghost"
            className={cn(
              "w-full justify-start text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-xl",
              sidebarCollapsed && "justify-center"
            )}
            asChild
          >
            <Link href="/help">
              <HelpCircle className={cn("h-5 w-5", !sidebarCollapsed && "mr-3")} />
              {!sidebarCollapsed && "Help & Support"}
            </Link>
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden">
          <div className="flex items-center justify-between h-16 px-4 bg-white/95 backdrop-blur-xl border-b border-gray-200/60">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="hover:bg-emerald-50"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg flex items-center justify-center">
                <Zap className="h-3 w-3 text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">AI Intelligence</span>
            </div>
            <div className="w-10" />
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
        
        {/* Upgrade Modal */}
        {showUpgradeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div 
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setShowUpgradeModal(false)}
            />
            <div className="relative bg-white rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Crown className="h-8 w-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Unlock Premium Features
                </h3>
                <p className="text-gray-600 mb-6">
                  Upgrade to access advanced analytics, team management, and priority support.
                </p>
                <div className="space-y-3">
                  <Button 
                    className="w-full bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white"
                    onClick={() => {
                      setShowUpgradeModal(false);
                      window.location.href = '/pricing';
                    }}
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    View Pricing Plans
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => setShowUpgradeModal(false)}
                  >
                    Maybe Later
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}