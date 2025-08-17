"use client";

import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscriptionGate } from "@/components/subscription-gate";
import { DashboardLayout } from "@/components/dashboard-layout";
import { 
  BarChart3, 
  Users, 
  TrendingUp, 
  Crown, 
  Zap, 
  Eye, 
  Target, 
  Globe, 
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Filter,
  ExternalLink,
  Calendar,
  Newspaper,
  Brain,
  Activity,
  Cpu
} from "lucide-react";

export default function Dashboard() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      {/* Company Branding Header */}
      <div className="px-6 py-8 bg-gradient-to-br from-emerald-900 via-green-800 to-teal-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIgLz48L3N2Zz4=')] opacity-30"></div>
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/30">
                <span className="text-2xl font-bold text-white">YC</span>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  Your Company Intelligence
                </h1>
                <p className="text-emerald-100 text-lg">
                  Real-time media monitoring and AI-powered insights for your brand
                </p>
                <div className="flex items-center mt-3 space-x-4 text-sm text-emerald-200">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full mr-2 animate-pulse"></div>
                    Live monitoring active
                  </div>
                  <div className="flex items-center">
                    <Activity className="h-4 w-4 mr-2" />
                    247 mentions this month
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                <Calendar className="h-4 w-4 mr-2" />
                Last 30 days
              </Button>
              <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="border-l-4 border-l-emerald-500 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-emerald-100 to-emerald-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Company Mentions</CardTitle>
            <Newspaper className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">247</div>
            <p className="text-xs text-muted-foreground flex items-center">
              <ArrowUpRight className="h-3 w-3 text-emerald-500 mr-1" />
              +18.2% from last month
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Publications Tracked</CardTitle>
            <Globe className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">1,247</div>
            <p className="text-xs text-muted-foreground flex items-center">
              <ArrowUpRight className="h-3 w-3 text-blue-500 mr-1" />
              +8 new this week
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Page Views</CardTitle>
            <Eye className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">847K</div>
            <p className="text-xs text-muted-foreground flex items-center">
              <ArrowUpRight className="h-3 w-3 text-purple-500 mr-1" />
              +23.1% engagement
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ad Opportunities</CardTitle>
            <Target className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">342</div>
            <p className="text-xs text-muted-foreground flex items-center">
              <ArrowUpRight className="h-3 w-3 text-orange-500 mr-1" />
              High-value targets
            </p>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Top Companies by Mentions */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-emerald-50 to-green-50 rounded-full -translate-y-32 translate-x-32 opacity-40"></div>
          <CardHeader className="flex flex-row items-center justify-between relative">
            <div>
              <CardTitle className="flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-emerald-600" />
                Company Mention Analytics
              </CardTitle>
              <CardDescription>Your company vs competitors this month</CardDescription>
            </div>
            <Button variant="outline" size="sm">
              <Search className="h-4 w-4 mr-2" />
              View All
            </Button>
          </CardHeader>
          <CardContent className="relative">
            {/* AI Insights Banner */}
            <div className="mb-6 p-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl border border-emerald-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
                    <Brain className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-emerald-900">AI Insight</p>
                    <p className="text-xs text-emerald-700">Your company mentions increased 18.2% this month, outperforming 67% of competitors</p>
                  </div>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 border-emerald-300">
                  Trending Up
                </Badge>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { company: "Your Company", mentions: 247, change: "+18.2%", trend: "up", publications: 47, avgViews: "324K", highlight: true },
                { company: "Competitor A", mentions: 189, change: "+12.7%", trend: "up", publications: 38, avgViews: "267K", highlight: false },
                { company: "Competitor B", mentions: 156, change: "-3.1%", trend: "down", publications: 29, avgViews: "198K", highlight: false },
                { company: "Industry Leader", mentions: 432, change: "+8.4%", trend: "up", publications: 89, avgViews: "567K", highlight: false },
                { company: "Market Challenger", mentions: 134, change: "+22.8%", trend: "up", publications: 24, avgViews: "145K", highlight: false }
              ].map((item, index) => (
                <div key={index} className={`flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors ${
                  item.highlight ? 'border-emerald-300 bg-emerald-50/50' : ''
                }`}>
                  <div className="flex items-center space-x-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm ${
                      item.highlight 
                        ? 'bg-gradient-to-br from-emerald-600 to-green-700 shadow-lg shadow-emerald-500/25' 
                        : 'bg-gradient-to-br from-gray-500 to-gray-600'
                    }`}>
                      {item.company.charAt(0)}
                    </div>
                    <div>
                      <p className={`font-semibold ${
                        item.highlight ? 'text-emerald-900' : 'text-gray-900'
                      }`}>
                        {item.company}
                        {item.highlight && (
                          <span className="ml-2 px-2 py-1 text-xs bg-emerald-100 text-emerald-700 rounded-full border border-emerald-200">
                            You
                          </span>
                        )}
                      </p>
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <span>{item.publications} publications</span>
                        <span>•</span>
                        <span>{item.avgViews} avg views</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{item.mentions.toLocaleString()}</p>
                      <p className={`text-sm flex items-center ${item.trend === 'up' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {item.trend === 'up' ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                        {item.change}
                      </p>
                    </div>
                    <Button variant="outline" size="sm">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI-Enhanced Advertising Opportunities */}
        <Card className="relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-50 to-red-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
          <CardHeader className="relative">
            <CardTitle className="flex items-center">
              <Target className="h-5 w-5 mr-2 text-orange-600" />
              AI-Powered Ad Opportunities
            </CardTitle>
            <CardDescription>Intelligent targeting based on your company mentions</CardDescription>
          </CardHeader>
          <CardContent className="relative">
            {/* AI Recommendation */}
            <div className="mb-4 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-lg border border-orange-200">
              <div className="flex items-center space-x-2">
                <Cpu className="h-4 w-4 text-orange-600" />
                <p className="text-xs font-medium text-orange-900">AI recommends targeting TechCrunch for maximum ROI based on your industry</p>
              </div>
            </div>
            <div className="space-y-4">
              {[
                { publication: "TechCrunch", mentions: 12, views: "890K", score: 95, recommended: true },
                { publication: "Forbes", mentions: 8, views: "654K", score: 92, recommended: false },
                { publication: "WSJ", mentions: 6, views: "432K", score: 89, recommended: false },
                { publication: "Bloomberg", mentions: 4, views: "298K", score: 87, recommended: true },
                { publication: "Reuters", mentions: 3, views: "187K", score: 84, recommended: false }
              ].map((item, index) => (
                <div key={index} className={`flex items-center justify-between p-3 border rounded-lg transition-all duration-300 ${
                  item.recommended ? 'border-orange-300 bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-gray-50'
                }`}>
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-medium text-gray-900">{item.publication}</p>
                      {item.recommended && (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-300 text-xs">
                          AI Pick
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{item.mentions} mentions • {item.views} views</p>
                  </div>
                  <div className="text-right">
                    <Badge variant={item.score >= 90 ? "default" : item.score >= 85 ? "secondary" : "outline"} className="mb-1">
                      {item.score}
                    </Badge>
                    <p className="text-xs text-gray-500">AI Score</p>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full mt-4" variant="outline">
              View All Opportunities
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>


      {/* Recent Activity & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Mentions</CardTitle>
            <CardDescription>
              Latest company mentions across tracked publications
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { company: "Your Company", publication: "TechCrunch", time: "2 minutes ago", sentiment: "positive", highlight: true },
                { company: "Your Company", publication: "Forbes", time: "8 minutes ago", sentiment: "neutral", highlight: true },
                { company: "Competitor A", publication: "WSJ", time: "15 minutes ago", sentiment: "positive", highlight: false },
                { company: "Your Company", publication: "Bloomberg", time: "23 minutes ago", sentiment: "positive", highlight: true },
                { company: "Industry Leader", publication: "Reuters", time: "31 minutes ago", sentiment: "negative", highlight: false }
              ].map((item, index) => (
                <div key={index} className="flex items-center space-x-4">
                  <div className={`w-2 h-2 rounded-full ${
                    item.sentiment === 'positive' ? 'bg-emerald-500' : 
                    item.sentiment === 'negative' ? 'bg-red-500' : 'bg-gray-500'
                  }`}></div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      <span className={item.highlight ? "text-emerald-600 font-semibold" : "text-gray-600"}>{item.company}</span> mentioned in {item.publication}
                    </p>
                    <p className="text-xs text-gray-500">{item.time}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {item.sentiment}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and media intelligence tools
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button className="w-full justify-start" variant="outline">
              <Search className="mr-2 h-4 w-4" />
              Search Companies
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Target className="mr-2 h-4 w-4" />
              Find Ad Opportunities
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <BarChart3 className="mr-2 h-4 w-4" />
              Generate Report
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Globe className="mr-2 h-4 w-4" />
              Add Publications
            </Button>
            <Button className="w-full justify-start" variant="outline">
              <Crown className="mr-2 h-4 w-4" />
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}