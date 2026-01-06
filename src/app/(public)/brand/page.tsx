import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Hexagon, Palette, PenLine, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata = {
  title: "Brand - HiveSight",
  description: "HiveSight brand guidelines, design system, and writing guide",
};

export default function BrandPage() {
  return (
    <main className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500/10 mb-6">
            <Hexagon className="h-10 w-10 text-amber-500 fill-amber-500/20" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-4">
            HiveSight brand
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Guidelines for representing HiveSight consistently across all
            touchpoints. Our brand reflects collective AI intelligence - the
            hive mind that powers insightful research.
          </p>
        </div>

        {/* Brand Cards */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <Link href="/brand/design" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:border-amber-500/50">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2 group-hover:bg-amber-500/20 transition-colors">
                  <Palette className="h-6 w-6 text-amber-500" />
                </div>
                <CardTitle className="text-xl">Design system</CardTitle>
                <CardDescription>
                  Colors, typography, spacing, and component patterns that
                  define the HiveSight visual identity.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-amber-600 dark:text-amber-400 font-medium group-hover:underline">
                  View design system &rarr;
                </span>
              </CardContent>
            </Card>
          </Link>

          <Link href="/brand/writing" className="group">
            <Card className="h-full transition-all hover:shadow-lg hover:border-amber-500/50">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center mb-2 group-hover:bg-amber-500/20 transition-colors">
                  <PenLine className="h-6 w-6 text-amber-500" />
                </div>
                <CardTitle className="text-xl">Writing guide</CardTitle>
                <CardDescription>
                  Voice, tone, and style guidelines for clear, approachable
                  communication about AI-powered research.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <span className="text-sm text-amber-600 dark:text-amber-400 font-medium group-hover:underline">
                  View writing guide &rarr;
                </span>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Brand essence */}
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 rounded-2xl p-8 mb-12">
          <h2 className="text-2xl font-bold mb-6">Brand essence</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div>
              <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                Mission
              </h3>
              <p className="text-muted-foreground">
                Make research accessible by simulating diverse public opinion at
                scale using AI.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                Vision
              </h3>
              <p className="text-muted-foreground">
                Every researcher, product team, and policymaker can instantly
                understand how people think.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">
                Values
              </h3>
              <p className="text-muted-foreground">
                Transparency about AI limitations. Accessibility for all skill
                levels. Speed without sacrificing quality.
              </p>
            </div>
          </div>
        </div>

        {/* Logo usage */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Logo</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardContent className="pt-6">
                <div className="bg-white dark:bg-neutral-900 rounded-lg p-8 flex items-center justify-center mb-4">
                  <div className="flex items-center gap-3">
                    <Hexagon className="h-12 w-12 text-amber-500 fill-amber-500/20" />
                    <span className="text-2xl font-bold">HiveSight</span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Primary logo - use on light backgrounds
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="bg-neutral-900 dark:bg-neutral-950 rounded-lg p-8 flex items-center justify-center mb-4">
                  <div className="flex items-center gap-3">
                    <Hexagon className="h-12 w-12 text-amber-500 fill-amber-500/20" />
                    <span className="text-2xl font-bold text-white">
                      HiveSight
                    </span>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Inverted logo - use on dark backgrounds
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Quick reference */}
        <div className="border rounded-xl p-6">
          <h2 className="text-xl font-bold mb-4">Quick reference</h2>
          <div className="grid gap-4 text-sm">
            <div className="flex items-start gap-4">
              <span className="font-medium min-w-[120px]">Primary color</span>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-amber-500" />
                <code className="text-muted-foreground">amber-500</code>
                <code className="text-muted-foreground">#f59e0b</code>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="font-medium min-w-[120px]">Font</span>
              <span className="text-muted-foreground">
                System font stack (Inter, -apple-system, etc.)
              </span>
            </div>
            <div className="flex items-start gap-4">
              <span className="font-medium min-w-[120px]">Icon</span>
              <div className="flex items-center gap-2">
                <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
                <span className="text-muted-foreground">
                  Hexagon from Lucide Icons
                </span>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <span className="font-medium min-w-[120px]">Tagline</span>
              <span className="text-muted-foreground">
                &ldquo;Simulate public opinion at scale&rdquo;
              </span>
            </div>
          </div>
        </div>

        {/* Download assets CTA */}
        <div className="mt-12 text-center">
          <p className="text-muted-foreground mb-4">
            Need logo files or other assets?
          </p>
          <Button variant="outline" disabled>
            <Download className="h-4 w-4 mr-2" />
            Download brand assets (coming soon)
          </Button>
        </div>
      </div>
    </main>
  );
}
