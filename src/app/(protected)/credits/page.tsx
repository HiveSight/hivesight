"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useUser } from "@/hooks/use-user";
import { CREDIT_BUNDLES, CREDIT_PRICE_CENTS } from "@/types";

export default function CreditsPage() {
  const { profile, loading } = useUser();
  const [credits, setCredits] = useState(500);
  const [purchasing, setPurchasing] = useState(false);

  const price = (credits * CREDIT_PRICE_CENTS) / 100;

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      const res = await fetch("/api/stripe/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credits }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error("Purchase error:", error);
      setPurchasing(false);
    }
  };

  const handleSliderChange = (value: number[]) => {
    setCredits(value[0]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value >= 10 && value <= 10000) {
      setCredits(value);
    }
  };

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Buy Credits</h1>
        <p className="text-muted-foreground mt-2">
          ${(CREDIT_PRICE_CENTS / 100).toFixed(2)} per credit
        </p>
      </div>

      {/* Current Balance */}
      {profile && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current Balance</span>
              <span className="text-2xl font-bold">
                {profile.credit_balance} credits
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Buy Bundles */}
      <div className="grid grid-cols-3 gap-4">
        {CREDIT_BUNDLES.map((bundle) => (
          <Card
            key={bundle.credits}
            className={`cursor-pointer transition-all hover:border-primary ${
              credits === bundle.credits ? "border-primary ring-1 ring-primary" : ""
            } ${bundle.popular ? "relative" : ""}`}
            onClick={() => setCredits(bundle.credits)}
          >
            {bundle.popular && (
              <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                Popular
              </span>
            )}
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold">{bundle.credits}</p>
              <p className="text-sm text-muted-foreground">credits</p>
              <p className="text-lg font-semibold mt-2">${bundle.price}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custom Amount */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Amount</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Slider
              value={[credits]}
              onValueChange={handleSliderChange}
              min={10}
              max={10000}
              step={10}
              className="flex-1"
            />
            <Input
              type="number"
              value={credits}
              onChange={handleInputChange}
              min={10}
              max={10000}
              className="w-24"
            />
          </div>

          <div className="flex items-center justify-between text-lg">
            <span>{credits} credits</span>
            <span className="font-bold">${price.toFixed(2)}</span>
          </div>

          <Button
            className="w-full"
            size="lg"
            onClick={handlePurchase}
            disabled={loading || purchasing || credits < 10}
          >
            {purchasing ? "Redirecting to checkout..." : `Buy ${credits} credits for $${price.toFixed(2)}`}
          </Button>
        </CardContent>
      </Card>

      {/* What can you do with credits */}
      <Card>
        <CardHeader>
          <CardTitle>What can you do with credits?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li>
              <strong>GPT-5 Mini (Likert):</strong> 4 respondents per credit
            </li>
            <li>
              <strong>GPT-5 Mini (Open-ended):</strong> 2 respondents per credit
            </li>
            <li>
              <strong>GPT-5 (Likert/Open-ended):</strong> 1 respondent per credit
            </li>
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Credits never expire and can be used anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
