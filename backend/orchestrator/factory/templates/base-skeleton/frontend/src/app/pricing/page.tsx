import { Navigation } from "@/components/navigation";
import { PricingCard } from "@/components/pricing-card";
import { PRICING_PLANS } from "@/lib/subscription";

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-2xl">
          <div className="text-xs font-mono text-gray-500">base-skeleton</div>
          <h1 className="mt-3 text-3xl font-semibold text-gray-900">Pricing</h1>
          <p className="mt-2 text-gray-600">
            Keep pricing light in the skeleton; enable real billing via the{" "}
            <code className="font-mono">billing-stripe</code> module.
          </p>
        </div>

        <div className="mt-10 grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {PRICING_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>
      </main>
    </div>
  );
}
