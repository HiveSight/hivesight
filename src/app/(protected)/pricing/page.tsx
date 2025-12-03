"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TIER_CONFIG } from "@/types";
import { useUser } from "@/hooks/use-user";
import { Check } from "lucide-react";

export default function PricingPage() {
  const { profile, loading } = useUser();
  const [subscribing, setSubscribing] = useState<string | null>(null);

  const handleSubscribe = async (tier: "basic" | "premium") => {
    setSubscribing(tier);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Subscription error:", error);
      setSubscribing(null);
    }
  };

  const tiers = [
    {
      id: "free" as const,
      name: "Free",
      price: "$0",
      description: "For trying things out",
      features: [
        `${TIER_CONFIG.free.monthlyCredits} credits/month`,
        `Up to ${TIER_CONFIG.free.maxHiveSize} respondents per survey`,
        "Basic demographic filters",
        "CSV export",
      ],
    },
    {
      id: "basic" as const,
      name: "Basic",
      price: `$${TIER_CONFIG.basic.priceMonthly}`,
      description: "For individual researchers",
      features: [
        `${TIER_CONFIG.basic.monthlyCredits.toLocaleString()} credits/month`,
        `Up to ${TIER_CONFIG.basic.maxHiveSize} respondents per survey`,
        "All demographic filters",
        "CSV export",
        "Priority support",
      ],
    },
    {
      id: "premium" as const,
      name: "Premium",
      price: `$${TIER_CONFIG.premium.priceMonthly}`,
      description: "For teams and organizations",
      features: [
        `${TIER_CONFIG.premium.monthlyCredits.toLocaleString()} credits/month`,
        `Up to ${TIER_CONFIG.premium.maxHiveSize} respondents per survey`,
        "All demographic filters",
        "CSV export",
        "API access",
        "Dedicated support",
      ],
    },
  ];

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Pricing</h1>
        <p className="text-muted-foreground mt-2">
          Choose the plan that works for you
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const isCurrentTier = profile?.tier === tier.id;

          return (
            <Card
              key={tier.id}
              className={isCurrentTier ? "border-primary" : undefined}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{tier.name}</span>
                  <span className="text-2xl">{tier.price}</span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {tier.description}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="space-y-2">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {tier.id === "free" ? (
                  <Button variant="outline" className="w-full" disabled>
                    {isCurrentTier ? "Current Plan" : "Free"}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    onClick={() => handleSubscribe(tier.id)}
                    disabled={loading || subscribing !== null || isCurrentTier}
                  >
                    {isCurrentTier
                      ? "Current Plan"
                      : subscribing === tier.id
                      ? "Redirecting..."
                      : `Subscribe to ${tier.name}`}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle>Your Usage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Plan</p>
                <p className="text-xl font-bold capitalize">{profile.tier}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Credit Balance</p>
                <p className="text-xl font-bold">{profile.credit_balance}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
