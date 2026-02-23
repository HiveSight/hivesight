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
    <div className="space-y-8 max-w-2xl mx-auto animate-fade-in">
      <div className="text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">Top up</p>
        <h1 className="text-3xl md:text-4xl font-bold font-serif">Buy credits</h1>
        <p className="text-muted-foreground mt-3 text-lg">
          ${(CREDIT_PRICE_CENTS / 100).toFixed(2)} per credit
        </p>
      </div>

      {/* Current Balance */}
      {profile && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current balance</span>
              <span className="text-2xl font-bold font-serif text-amber-700 dark:text-amber-400">
                {profile.credit_balance} credits
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Buy Bundles */}
      <div className="grid grid-cols-3 gap-4 stagger-children">
        {CREDIT_BUNDLES.map((bundle) => (
          <Card
            key={bundle.credits}
            className={`cursor-pointer transition-all duration-200 ${
              credits === bundle.credits ? "border-amber-500 ring-1 ring-amber-500/20" : "hover:border-amber-300"
            } ${bundle.popular ? "relative" : ""}`}
            onClick={() => setCredits(bundle.credits)}
          >
            {bundle.popular && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-amber-600 text-white text-xs font-medium px-2.5 py-0.5 rounded-full">
                Popular
              </span>
            )}
            <CardContent className="pt-6 text-center">
              <p className="text-2xl font-bold font-serif">{bundle.credits}</p>
              <p className="text-sm text-muted-foreground">credits</p>
              <p className="text-lg font-semibold mt-2 text-amber-700 dark:text-amber-400">${bundle.price}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Custom Amount */}
      <Card>
        <CardHeader>
          <CardTitle className="font-serif">Custom amount</CardTitle>
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

          <div className="flex items-center justify-between text-lg p-4 bg-amber-50/50 rounded-xl border border-amber-200/40 dark:bg-amber-900/10 dark:border-amber-700/20">
            <span>{credits} credits</span>
            <span className="font-bold text-amber-700 dark:text-amber-400">${price.toFixed(2)}</span>
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
          <CardTitle className="font-serif">What can you do with credits?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="text-foreground">GPT-5 Mini (Likert):</strong> 4 respondents per credit</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="text-foreground">GPT-5 Mini (Open-ended):</strong> 2 respondents per credit</span>
            </li>
            <li className="flex items-center gap-3">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
              <span><strong className="text-foreground">GPT-5 (Likert/Open-ended):</strong> 1 respondent per credit</span>
            </li>
          </ul>
          <p className="mt-5 text-sm text-muted-foreground/70">
            Credits never expire and can be used anytime.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
