"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscriptionGate } from "@/components/subscription-gate";
import { DashboardLayout } from "@/components/dashboard-layout";
import { 
  BarChart3, 
  TrendingUp, 
  Target, 
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Crown,
  Zap,
  Calendar,
  Download,
  Filter,
  Eye,
  Users,
  Globe
} from "lucide-react";

export default function AdvancedAnalyticsPage() {
  return (
    <DashboardLayout>
      <SubscriptionGate>
        {/* Header */}
        <div className="px-6 py-8 bg-gradient-to-br from-purple-900 via-indigo-800 to-blue-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIgLz48L3N2Zz4=')] opacity-30"></div>
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/30">
                  <BarChart3 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h1 className="text-3xl font-bold text-white">
                      Advanced Analytics
                    </h1>
                    <Badge className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-none">
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>
                  <p className="text-purple-100 text-lg">
                    Deep insights into mention patterns, ROI analysis, and predictive forecasting
                  </p>
                  <div className="flex items-center mt-3 space-x-4 text-sm text-purple-200">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-purple-400 rounded-full mr-2 animate-pulse"></div>
                      Real-time analytics active
                    </div>
                    <div className="flex items-center">
                      <Activity className="h-4 w-4 mr-2" />
                      94.7% prediction accuracy
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                  <Calendar className="h-4 w-4 mr-2" />
                  Custom Range
                </Button>
                <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Premium Analytics Metrics */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-l-4 border-l-purple-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100 to-purple-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ROI Prediction</CardTitle>
                <Target className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">+342%</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <ArrowUpRight className="h-3 w-3 text-purple-500 mr-1" />
                  +28% vs forecast
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-blue-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Sentiment Score</CardTitle>
                <TrendingUp className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">8.7/10</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <ArrowUpRight className="h-3 w-3 text-blue-500 mr-1" />
                  +1.2 this week
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-100 to-green-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Reach Multiplier</CardTitle>
                <Eye className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">4.2x</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <ArrowUpRight className="h-3 w-3 text-green-500 mr-1" />
                  Organic amplification
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-orange-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Market Share</CardTitle>
                <Globe className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">23.4%</div>
                <p className="text-xs text-muted-foreground flex items-center">
                  <ArrowUpRight className="h-3 w-3 text-orange-500 mr-1" />
                  +2.1% market growth
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Advanced Charts and Analytics */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-full -translate-y-32 translate-x-32 opacity-40"></div>
              <CardHeader className="relative">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center">
                      <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
                      ROI Trend Analysis
                    </CardTitle>
                    <CardDescription>Advanced prediction modeling with confidence intervals</CardDescription>
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="h-4 w-4 mr-2" />
                    Configure
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="relative">
                {/* Advanced Chart Visualization */}
                <div className="h-96 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl p-6 relative overflow-hidden">
                  {/* Background Grid */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="grid grid-cols-12 grid-rows-8 h-full w-full">
                      {Array.from({ length: 96 }).map((_, i) => (
                        <div key={i} className="border-r border-b border-purple-300 border-opacity-30" />
                      ))}
                    </div>
                  </div>
                  
                  {/* Chart Lines */}
                  <div className="relative h-full">
                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 300">
                      <defs>
                        <linearGradient id="roiGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.3"/>
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0"/>
                        </linearGradient>
                        <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2"/>
                          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"/>
                        </linearGradient>
                      </defs>
                      
                      {/* Confidence interval area */}
                      <path
                        d="M 0 200 Q 50 180 100 160 T 200 140 T 300 120 T 400 100 L 400 220 Q 350 240 300 250 T 200 260 T 100 250 T 0 240 Z"
                        fill="url(#confidenceGradient)"
                      />
                      
                      {/* Main ROI line */}
                      <path
                        d="M 0 220 Q 50 200 100 180 T 200 160 T 300 140 T 400 120"
                        stroke="#8b5cf6"
                        strokeWidth="4"
                        fill="none"
                        className="drop-shadow-lg"
                      />
                      
                      {/* Prediction line */}
                      <path
                        d="M 250 170 Q 300 150 350 130 T 400 110"
                        stroke="#06b6d4"
                        strokeWidth="3"
                        fill="none"
                        strokeDasharray="8,4"
                        opacity="0.8"
                      />
                      
                      {/* Data points */}
                      <circle cx="100" cy="180" r="5" fill="#8b5cf6" className="drop-shadow-lg" />
                      <circle cx="200" cy="160" r="5" fill="#8b5cf6" className="drop-shadow-lg" />
                      <circle cx="300" cy="140" r="5" fill="#8b5cf6" className="drop-shadow-lg" />
                    </svg>
                    
                    {/* Floating metrics */}
                    <div className="absolute top-6 right-6 bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg">
                      <div className="text-xs text-gray-600 mb-1">Current ROI</div>
                      <div className="text-2xl font-bold text-purple-600">342%</div>
                      <div className="text-xs text-green-600">↗ +28% predicted</div>
                    </div>
                    
                    <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-sm rounded-xl p-4 shadow-lg">
                      <div className="text-xs text-gray-600 mb-1">Confidence</div>
                      <div className="text-lg font-bold text-blue-600">94.7%</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center">
                  <Crown className="h-5 w-5 mr-2 text-indigo-600" />
                  Premium Insights
                </CardTitle>
                <CardDescription>AI-powered recommendations</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg flex items-center justify-center">
                        <Zap className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-purple-900">Optimization Opportunity</p>
                        <p className="text-xs text-purple-700">Shift 15% budget to TechCrunch for +47% ROI</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-blue-900">Trend Alert</p>
                        <p className="text-xs text-blue-700">AI trend detected: sustainable tech +127% mentions</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border border-green-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center">
                        <Target className="h-4 w-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-green-900">Goal Achievement</p>
                        <p className="text-xs text-green-700">Q4 target reached 3 weeks early</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <Button className="w-full mt-6 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white">
                  View All Insights
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </SubscriptionGate>
    </DashboardLayout>
  );
}