"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SubscriptionGate } from "@/components/subscription-gate";
import { DashboardLayout } from "@/components/dashboard-layout";
import { 
  Users, 
  Crown, 
  Plus,
  Settings,
  Mail,
  Shield,
  Activity,
  BarChart3,
  Calendar,
  CheckCircle,
  AlertCircle,
  UserPlus,
  Edit3,
  Trash2,
  MoreHorizontal
} from "lucide-react";

export default function TeamManagementPage() {
  const teamMembers = [
    {
      id: 1,
      name: "Sarah Johnson",
      email: "sarah@company.com",
      role: "Admin",
      status: "Active",
      lastActive: "2 minutes ago",
      permissions: ["Full Access", "Analytics", "Team Management"],
      avatar: "SJ"
    },
    {
      id: 2,
      name: "Mike Chen",
      email: "mike@company.com",
      role: "Analyst",
      status: "Active",
      lastActive: "1 hour ago",
      permissions: ["Analytics", "Reports"],
      avatar: "MC"
    },
    {
      id: 3,
      name: "Emma Davis",
      email: "emma@company.com",
      role: "Viewer",
      status: "Invited",
      lastActive: "Never",
      permissions: ["View Only"],
      avatar: "ED"
    }
  ];

  return (
    <DashboardLayout>
      <SubscriptionGate>
        {/* Header */}
        <div className="px-6 py-8 bg-gradient-to-br from-indigo-900 via-blue-800 to-purple-900 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZ3JpZCIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBwYXR0ZXJuVW5pdHM9InVzZXJTcGFjZU9uVXNlIj48cGF0aCBkPSJNIDQwIDAgTCAwIDAgMCA0MCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMSkiIHN0cm9rZS13aWR0aD0iMSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0idXJsKCNncmlkKSIgLz48L3N2Zz4=')] opacity-30"></div>
          <div className="relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-6">
                <div className="w-16 h-16 bg-white/20 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/30">
                  <Users className="h-8 w-8 text-white" />
                </div>
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h1 className="text-3xl font-bold text-white">
                      Team Management
                    </h1>
                    <Badge className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-none">
                      <Crown className="h-3 w-3 mr-1" />
                      Premium
                    </Badge>
                  </div>
                  <p className="text-indigo-100 text-lg">
                    Manage team members, permissions, and collaborative workflows
                  </p>
                  <div className="flex items-center mt-3 space-x-4 text-sm text-indigo-200">
                    <div className="flex items-center">
                      <div className="w-2 h-2 bg-indigo-400 rounded-full mr-2 animate-pulse"></div>
                      3 active members
                    </div>
                    <div className="flex items-center">
                      <Activity className="h-4 w-4 mr-2" />
                      1 pending invitation
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Button className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white">
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite Member
                </Button>
                <Button variant="outline" size="sm" className="bg-white/20 border-white/30 text-white hover:bg-white/30">
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Team Stats */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="border-l-4 border-l-blue-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100 to-blue-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Members</CardTitle>
                <Users className="h-4 w-4 text-blue-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">3</div>
                <p className="text-xs text-muted-foreground">
                  +1 invited this week
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-green-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-100 to-green-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
                <Activity className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">2</div>
                <p className="text-xs text-muted-foreground">
                  Online right now
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-purple-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-100 to-purple-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Team Analytics</CardTitle>
                <BarChart3 className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">847</div>
                <p className="text-xs text-muted-foreground">
                  Actions this month
                </p>
              </CardContent>
            </Card>
            
            <Card className="border-l-4 border-l-orange-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Collaboration Score</CardTitle>
                <CheckCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">9.2/10</div>
                <p className="text-xs text-muted-foreground">
                  Excellent teamwork
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Team Members List */}
        <div className="px-6 py-6">
          <Card className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-full -translate-y-32 translate-x-32 opacity-40"></div>
            <CardHeader className="relative">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    <Users className="h-5 w-5 mr-2 text-indigo-600" />
                    Team Members
                  </CardTitle>
                  <CardDescription>Manage your team access and permissions</CardDescription>
                </div>
                <Button className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Member
                </Button>
              </div>
            </CardHeader>
            <CardContent className="relative">
              <div className="space-y-4">
                {teamMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-xl hover:bg-gray-50 transition-colors">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold">
                        {member.avatar}
                      </div>
                      <div>
                        <div className="flex items-center space-x-3">
                          <p className="font-semibold text-gray-900">{member.name}</p>
                          <Badge 
                            variant={member.status === 'Active' ? 'default' : 'secondary'}
                            className={member.status === 'Active' ? 'bg-green-100 text-green-700' : ''}
                          >
                            {member.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{member.email}</p>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-400">
                          <span>Role: {member.role}</span>
                          <span>•</span>
                          <span>Last active: {member.lastActive}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">Permissions</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {member.permissions.map((permission, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {permission}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                          <Edit3 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Mail className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Team Activity and Permissions */}
        <div className="px-6 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center">
                  <Activity className="h-5 w-5 mr-2 text-blue-600" />
                  Recent Activity
                </CardTitle>
                <CardDescription>Team collaboration timeline</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-4">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center">
                      <CheckCircle className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Sarah updated analytics dashboard</p>
                      <p className="text-xs text-gray-500">2 minutes ago</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-full flex items-center justify-center">
                      <BarChart3 className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Mike generated quarterly report</p>
                      <p className="text-xs text-gray-500">1 hour ago</p>
                    </div>
                  </div>
                  
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-full flex items-center justify-center">
                      <Mail className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Emma invitation sent</p>
                      <p className="text-xs text-gray-500">2 days ago</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-50 to-indigo-50 rounded-full -translate-y-16 translate-x-16 opacity-60"></div>
              <CardHeader className="relative">
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2 text-purple-600" />
                  Permission Management
                </CardTitle>
                <CardDescription>Control team access levels</CardDescription>
              </CardHeader>
              <CardContent className="relative">
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200">
                    <h4 className="font-semibold text-purple-900 mb-2">Admin Access</h4>
                    <ul className="text-sm text-purple-800 space-y-1">
                      <li>• Full dashboard access</li>
                      <li>• Team management</li>
                      <li>• Billing and subscriptions</li>
                      <li>• Advanced analytics</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">Analyst Access</h4>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Dashboard viewing</li>
                      <li>• Report generation</li>
                      <li>• Data export</li>
                    </ul>
                  </div>
                  
                  <div className="p-4 bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl border border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-2">Viewer Access</h4>
                    <ul className="text-sm text-gray-800 space-y-1">
                      <li>• Read-only dashboard</li>
                      <li>• Basic reports</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </SubscriptionGate>
    </DashboardLayout>
  );
}