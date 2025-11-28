import { Navigation } from "@/components/navigation";
import { PricingCard } from "@/components/pricing-card";
import { PRICING_PLANS } from "@/lib/subscription";
import { Button } from "@/components/ui/button";
import { Check, Crown, Zap, Star, ArrowRight, Shield, Clock, Users } from "lucide-react";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      {/* Hero Section */}
      <section className="relative overflow-hidden px-4 sm:px-6 lg:px-8 pt-32 pb-16">
        <div className="max-w-7xl mx-auto">
          {/* Animated background elements */}
          <div className="absolute top-20 left-10 w-64 h-64 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute top-40 right-10 w-64 h-64 bg-indigo-200 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
          
          <div className="relative text-center max-w-4xl mx-auto">
            {/* Badge */}
            <div className="inline-flex items-center px-6 py-3 rounded-full bg-gradient-to-r from-purple-100 to-indigo-100 text-purple-700 text-sm font-medium mb-8 border border-purple-200 shadow-lg shadow-purple-500/10">
              <Crown className="w-4 h-4 mr-2" />
              Simple, transparent pricing
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-8 leading-tight text-gray-900">
              <span className="inline-block">Choose the perfect plan for</span>
              <span className="block bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
                your AI intelligence needs
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-gray-600 mb-12 max-w-3xl mx-auto leading-relaxed">
              Start free, scale as you grow. All plans include our core AI-powered insights with advanced features for teams and enterprises.
            </p>

            {/* Social proof */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-sm text-gray-600 mb-16">
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-2" />
                10,000+ companies trust us
              </div>
              <div className="flex items-center">
                <Star className="w-4 h-4 mr-2 text-yellow-400 fill-current" />
                4.9/5 customer satisfaction
              </div>
              <div className="flex items-center">
                <Shield className="w-4 h-4 mr-2 text-green-500" />
                Enterprise-grade security
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="px-4 sm:px-6 lg:px-8 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {PRICING_PLANS.map((plan, index) => (
              <div 
                key={plan.id} 
                className={`transform transition-all duration-300 hover:scale-105 ${
                  plan.popular ? 'scale-105' : ''
                }`}
              >
                <PricingCard plan={plan} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-24 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-xl text-gray-600">
              Everything you need to know about our AI intelligence platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  How does the free trial work?
                </h3>
                <p className="text-gray-600">
                  Start with a 7-day free trial on any paid plan. No credit card required. Cancel anytime during the trial period.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Can I change plans anytime?
                </h3>
                <p className="text-gray-600">
                  Yes! Upgrade or downgrade your plan at any time. Changes take effect immediately with prorated billing.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  What payment methods do you accept?
                </h3>
                <p className="text-gray-600">
                  We accept all major credit cards, PayPal, and ACH transfers for enterprise customers.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Is my data secure?
                </h3>
                <p className="text-gray-600">
                  Absolutely. We use enterprise-grade encryption, SOC 2 compliance, and never share your data with third parties.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  Do you offer custom integrations?
                </h3>
                <p className="text-gray-600">
                  Enterprise plans include custom integrations, dedicated support, and white-label options.
                </p>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">
                  What's included in support?
                </h3>
                <p className="text-gray-600">
                  All plans include email support. Professional and Enterprise plans get priority support and phone access.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Comparison */}
      <section className="px-4 sm:px-6 lg:px-8 py-24 bg-gradient-to-br from-gray-50 to-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Compare Features
            </h2>
            <p className="text-xl text-gray-600">
              See what's included in each plan
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
            <div className="grid lg:grid-cols-4 gap-0">
              {/* Feature list header */}
              <div className="p-6 bg-gray-50 border-r border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Features</h3>
              </div>
              
              {/* Plan headers */}
              {PRICING_PLANS.map((plan) => (
                <div key={plan.id} className="p-6 bg-gray-50 text-center border-r border-gray-200 last:border-r-0">
                  <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                  <p className="text-2xl font-bold text-gray-900 mt-2">{plan.price}</p>
                </div>
              ))}
            </div>

            {/* Feature rows */}
            <div className="divide-y divide-gray-200">
              {[
                "AI-powered insights",
                "Real-time monitoring", 
                "Basic analytics",
                "Email support",
                "Advanced analytics",
                "Team collaboration",
                "Priority support",
                "Custom integrations",
                "White-label options",
                "Dedicated support"
              ].map((feature, index) => (
                <div key={feature} className="grid lg:grid-cols-4 gap-0">
                  <div className="p-4 border-r border-gray-200">
                    <span className="text-sm text-gray-900">{feature}</span>
                  </div>
                  {PRICING_PLANS.map((plan) => {
                    const included = plan.features.some(f => 
                      f.toLowerCase().includes(feature.toLowerCase().split(' ')[0]) ||
                      feature.toLowerCase().includes(f.toLowerCase().split(' ')[0])
                    );
                    
                    return (
                      <div key={plan.id} className="p-4 text-center border-r border-gray-200 last:border-r-0">
                        {included ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8 py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-purple-600 via-indigo-600 to-blue-600 rounded-3xl p-12 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to supercharge your business intelligence?
              </h2>
              <p className="text-xl text-purple-100 mb-8 max-w-2xl mx-auto">
                Join thousands of companies using AI-powered insights to make better decisions and drive growth.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="bg-white text-purple-600 hover:bg-gray-100 shadow-xl">
                  <Zap className="mr-2 h-5 w-5" />
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
                  <Clock className="mr-2 h-5 w-5" />
                  Schedule Demo
                </Button>
              </div>
              <p className="text-sm text-purple-200 mt-4">
                No credit card required • 7-day free trial • Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}