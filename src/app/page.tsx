import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";
import Link from "next/link";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-6">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
            Simulate Public Opinion
            <br />
            <span className="text-muted-foreground">At Scale</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            HiveSight uses AI to simulate how diverse Americans would respond to
            your questions. Get instant feedback from hundreds of perspectives.
          </p>
          <div className="flex gap-4 justify-center pt-4">
            <LoginButton />
            <Button variant="outline" size="lg" asChild>
              <Link href="#how-it-works">Learn more</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-4 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  1
                </div>
                <h3 className="text-xl font-semibold">Ask Your Question</h3>
                <p className="text-muted-foreground">
                  Enter a statement or question you want to test with a
                  representative sample of Americans.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  2
                </div>
                <h3 className="text-xl font-semibold">Configure Your Hive</h3>
                <p className="text-muted-foreground">
                  Choose demographic filters, sample size, and response type.
                  Target specific age ranges, incomes, or regions.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  3
                </div>
                <h3 className="text-xl font-semibold">Get Insights</h3>
                <p className="text-muted-foreground">
                  Receive detailed results with distribution charts, statistics,
                  and individual responses. Export to CSV for further analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {[
              "Simulate responses from diverse demographic groups",
              "Likert scale and open-ended response formats",
              "Filter by age, income, and geographic region",
              "Statistical analysis with confidence intervals",
              "Export raw data to CSV for further analysis",
              "Real-time cost estimation before running surveys",
              "Powered by GPT-4o and GPT-4o Mini",
              "Fast results - typically under a minute",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-muted/50">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Ready to get started?</h2>
          <p className="text-muted-foreground">
            Sign up now and get 100 free credits to try HiveSight.
          </p>
          <LoginButton />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} HiveSight
          </p>
          <div className="flex gap-4 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
