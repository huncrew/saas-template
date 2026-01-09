"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/dashboard-layout";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Activity,
  Zap,
  Target,
  BarChart3
} from "lucide-react";

export default function IntelligencePage() {
  return (
    <DashboardLayout>
      {/* Header */}
      <div className="px-6 py-6 bg-white border-b border-gray-200">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              AI Intelligence Center
            </h1>
            <p className="text-gray-600 mt-2">
              Advanced AI-powered insights and predictive analytics for financial markets
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
              <Activity className="h-3 w-3 mr-1" />
              Live Data
            </Badge>
            <Button>
              <Brain className="h-4 w-4 mr-2" />
              Run Analysis
            </Button>
          </div>
        </div>
      </div>

      {/* AI Insights Cards */}
      <div className="px-6 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Confidence</CardTitle>
            <Brain className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">94.7%</div>
            <p className="text-xs text-muted-foreground">
              High accuracy predictions
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Market Signals</CardTitle>
            <Zap className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">1,247</div>
            <p className="text-xs text-muted-foreground">
              Active indicators tracked
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-orange-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Risk Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">3</div>
            <p className="text-xs text-muted-foreground">
              Require attention
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opportunities</CardTitle>
            <Target className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">23</div>
            <p className="text-xs text-muted-foreground">
              High-value targets
            </p>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Main Intelligence Dashboard */}
      <div className="px-6 py-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Market Analysis Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-emerald-600" />
                  AI Market Analysis
                </CardTitle>
                <CardDescription>Real-time predictive analytics and market sentiment</CardDescription>
              </div>
              <Button variant="outline" size="sm">
                Export Data
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Cool Graph Visualization */}
            <div className="h-80 bg-gradient-to-br from-emerald-50 to-blue-50 rounded-lg p-6 relative overflow-hidden">
              {/* Background Grid */}
              <div className="absolute inset-0 opacity-20">
                <div className="grid grid-cols-12 grid-rows-8 h-full w-full">
                  {Array.from({ length: 96 }).map((_, i) => (
                    <div key={i} className="border-r border-b border-gray-300 border-opacity-30" />
                  ))}
                </div>
              </div>
              
              {/* Chart Lines */}
              <div className="relative h-full">
                {/* Main trend line */}
                <svg className="absolute inset-0 w-full h-full" viewBox="0 0 400 200">
                  <defs>
                    <linearGradient id="gradient1" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.3"/>
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
                    </linearGradient>
                  </defs>
                  
                  {/* Area under curve */}
                  <path
                    d="M 0 150 Q 50 120 100 110 T 200 100 T 300 90 T 400 85 L 400 200 L 0 200 Z"
                    fill="url(#gradient1)"
                  />
                  
                  {/* Main line */}
                  <path
                    d="M 0 150 Q 50 120 100 110 T 200 100 T 300 90 T 400 85"
                    stroke="#10b981"
                    strokeWidth="3"
                    fill="none"
                    className="drop-shadow-sm"
                  />
                  
                  {/* Secondary line */}
                  <path
                    d="M 0 160 Q 60 140 120 130 T 240 120 T 360 110 T 400 105"
                    stroke="#3b82f6"
                    strokeWidth="2"
                    fill="none"
                    strokeDasharray="5,5"
                    opacity="0.7"
                  />
                  
                  {/* Data points */}
                  <circle cx="100" cy="110" r="4" fill="#10b981" className="drop-shadow-sm" />
                  <circle cx="200" cy="100" r="4" fill="#10b981" className="drop-shadow-sm" />
                  <circle cx="300" cy="90" r="4" fill="#10b981" className="drop-shadow-sm" />
                </svg>
                
                {/* Chart Labels */}
                <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs text-gray-600">
                  <span>Jan</span>
                  <span>Feb</span>
                  <span>Mar</span>
                  <span>Apr</span>
                  <span>May</span>
                  <span>Jun</span>
                </div>
                
                <div className="absolute top-4 left-4 right-4 flex justify-between text-xs text-gray-600">
                  <span>100%</span>
                  <span className="text-right">
                    <div className="flex items-center space-x-4">
                      <div className="flex items-center">
                        <div className="w-3 h-0.5 bg-emerald-500 mr-2"></div>
                        <span>AI Predictions</span>
                      </div>
                      <div className="flex items-center">
                        <div className="w-3 h-0.5 bg-blue-500 mr-2 border-dashed"></div>
                        <span>Market Reality</span>
                      </div>
                    </div>
                  </span>
                </div>
                
                {/* Floating metrics */}
                <div className="absolute top-16 right-6 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-sm">
                  <div className="text-xs text-gray-600">Current Accuracy</div>
                  <div className="text-lg font-bold text-emerald-600">94.7%</div>
                </div>
                
                <div className="absolute bottom-16 left-6 bg-white/90 backdrop-blur-sm rounded-lg p-3 shadow-sm">
                  <div className="text-xs text-gray-600">Trend Strength</div>
                  <div className="text-lg font-bold text-blue-600">Strong ↗</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Insights Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Brain className="h-5 w-5 mr-2 text-purple-600" />
              AI Insights
            </CardTitle>
            <CardDescription>Latest intelligence updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start space-x-3 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-900">
                    High Confidence Signal
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    AAPL showing strong upward momentum with 96% confidence
                  </p>
                  <p className="text-xs text-emerald-600 mt-1">2 minutes ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 bg-orange-50 rounded-lg border border-orange-200">
                <AlertTriangle className="h-5 w-5 text-orange-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-900">
                    Risk Alert
                  </p>
                  <p className="text-xs text-orange-700 mt-1">
                    Unusual volatility detected in tech sector
                  </p>
                  <p className="text-xs text-orange-600 mt-1">15 minutes ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Market Opportunity
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Emerging pattern in renewable energy stocks
                  </p>
                  <p className="text-xs text-blue-600 mt-1">1 hour ago</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                <Activity className="h-5 w-5 text-purple-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-purple-900">
                    Model Update
                  </p>
                  <p className="text-xs text-purple-700 mt-1">
                    Neural network retrained with latest data
                  </p>
                  <p className="text-xs text-purple-600 mt-1">3 hours ago</p>
                </div>
              </div>
            </div>
            
            <Button className="w-full mt-4" variant="outline">
              View All Insights
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* AI Models Performance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Sentiment Analysis</CardTitle>
            <CardDescription>Market sentiment prediction model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Accuracy</span>
                <span className="font-bold text-emerald-600">92.3%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full" style={{width: '92.3%'}}></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Last updated: 5 min ago</span>
                <span>Status: Active</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Price Prediction</CardTitle>
            <CardDescription>Stock price forecasting model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Accuracy</span>
                <span className="font-bold text-blue-600">87.8%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{width: '87.8%'}}></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Last updated: 12 min ago</span>
                <span>Status: Active</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Risk Assessment</CardTitle>
            <CardDescription>Portfolio risk analysis model</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Accuracy</span>
                <span className="font-bold text-purple-600">95.1%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-purple-500 h-2 rounded-full" style={{width: '95.1%'}}></div>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Last updated: 3 min ago</span>
                <span>Status: Active</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </DashboardLayout>
  );
}