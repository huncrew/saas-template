"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { SubscriptionStatus } from "@/types";
import { PRICING_PLANS } from "@/lib/subscription";
import { 
  Settings, 
  User, 
  CreditCard,
  Bell,
  Shield,
  Key,
  Download,
  Trash2,
  Edit3,
  Crown,
  Calendar,
  Activity,
  AlertCircle,
  CheckCircle
} from "lucide-react";

function useOptionalSession() {
  try {
    const result = useSession?.();
    if (!result) return { data: undefined };
    return result;
  } catch {
    return { data: undefined };
  }
}

export default function SettingsPage() {
  const sessionResult = useOptionalSession();
  const session = sessionResult?.data;
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchSubscriptionStatus() {
      if (!session?.user?.id) return;

      try {
        const response = await apiClient.getSubscriptionStatus(session.user.id);
        if (response.success && response.data) {
          setSubscriptionStatus(response.data);
        }
      } catch (error) {
        console.error('Error fetching subscription:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSubscriptionStatus();
  }, [session?.user?.id]);

  const currentPlan = PRICING_PLANS.find(plan => 
    plan.stripePriceId === subscriptionStatus?.stripePriceId
  ) || PRICING_PLANS[0]; // Default to starter plan

  return (
    <div className="space-y-12">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <User className="h-5 w-5 mr-2 text-blue-600" />
              Account Information
            </CardTitle>
            <CardDescription>Manage your personal information and preferences</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Name</label>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-900">{session?.user?.name || 'Not set'}</span>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Email</label>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-900">{session?.user?.email || 'Not set'}</span>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Company</label>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-900">Your Company</span>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Time Zone</label>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <span className="text-gray-900">{Intl.DateTimeFormat().resolvedOptions().timeZone}</span>
                  <Button variant="ghost" size="sm">
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription & Billing */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2 text-green-600" />
              Subscription & Billing
            </CardTitle>
            <CardDescription>Manage your subscription plan and billing information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Current Plan */}
              <div className="p-6 border rounded-xl bg-gradient-to-r from-gray-50 to-white">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center space-x-3">
                      <h3 className="text-lg font-semibold text-gray-900">{currentPlan.name} Plan</h3>
                      <Badge className={`${
                        subscriptionStatus?.hasActiveSubscription 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {subscriptionStatus?.hasActiveSubscription ? 'Active' : 'Free Trial'}
                      </Badge>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{currentPlan.price}</p>
                    <p className="text-sm text-gray-600 mt-1">
                      {subscriptionStatus?.hasActiveSubscription 
                        ? 'Next billing date: ' + new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()
                        : 'No active subscription'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Button className="mb-2">
                      <Crown className="h-4 w-4 mr-2" />
                      Upgrade Plan
                    </Button>
                    <div className="text-xs text-gray-500">
                      <Calendar className="h-3 w-3 inline mr-1" />
                      Billing monthly
                    </div>
                  </div>
                </div>
                
                {/* Plan Features */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-200">
                  {currentPlan.features.slice(0, 6).map((feature, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Billing History */}
              <div>
                <h4 className="text-md font-semibold text-gray-900 mb-4">Recent Billing History</h4>
                <div className="space-y-3">
                  {[
                    { date: '2024-01-15', amount: currentPlan.price, status: 'Paid', invoice: 'INV-001' },
                    { date: '2023-12-15', amount: currentPlan.price, status: 'Paid', invoice: 'INV-002' },
                    { date: '2023-11-15', amount: currentPlan.price, status: 'Paid', invoice: 'INV-003' },
                  ].map((bill, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-4">
                        <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{bill.amount}</p>
                          <p className="text-xs text-gray-500">{bill.date}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge variant="outline" className="text-green-600">
                          {bill.status}
                        </Badge>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Bell className="h-5 w-5 mr-2 text-orange-600" />
              Notification Preferences
            </CardTitle>
            <CardDescription>Choose what notifications you want to receive</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { name: 'Email notifications', description: 'Receive email updates about your account', enabled: true },
                { name: 'Marketing emails', description: 'Receive newsletters and product updates', enabled: false },
                { name: 'Security alerts', description: 'Get notified about account security events', enabled: true },
                { name: 'Billing notifications', description: 'Receive billing and payment notifications', enabled: true },
              ].map((notification, index) => (
                <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{notification.name}</p>
                    <p className="text-xs text-gray-500">{notification.description}</p>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      defaultChecked={notification.enabled}
                      className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Security */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="h-5 w-5 mr-2 text-purple-600" />
              Security & Privacy
            </CardTitle>
            <CardDescription>Manage your account security and privacy settings</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Key className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Password</p>
                    <p className="text-xs text-gray-500">Last changed 3 months ago</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Change Password
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Shield className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                    <p className="text-xs text-gray-500">Add an extra layer of security</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Enable 2FA
                </Button>
              </div>
              
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Download className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Export Data</p>
                    <p className="text-xs text-gray-500">Download your account data</p>
                  </div>
                </div>
                <Button variant="outline" size="sm">
                  Download
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="flex items-center text-red-600">
              <AlertCircle className="h-5 w-5 mr-2" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible and destructive actions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 border border-red-200 rounded-lg bg-red-50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-red-900">Delete Account</p>
                  <p className="text-xs text-red-700">
                    Permanently delete your account and all associated data
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Account
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
    </div>
  );
}