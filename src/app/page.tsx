import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Hexagon } from "lucide-react";
import Link from "next/link";
import { HeroSurveyForm } from "@/components/survey/hero-survey-form";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-honeycomb">
      {/* Header */}
      <header className="py-4 px-4 border-b border-amber-900/[0.06] bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Hexagon className="h-8 w-8 text-amber-500 fill-amber-500/20 transition-transform duration-300 group-hover:rotate-[30deg]" />
            <span className="text-xl font-bold font-serif text-foreground tracking-tight">HiveSight</span>
          </Link>
          <LoginButton />
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-28 px-4 overflow-hidden">
        {/* Subtle radial gradient behind hero */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsla(38,92%,50%,0.06)_0%,_transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400">
              AI-powered survey research
            </p>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight leading-[1.1] font-serif">
              What do the people in your area{" "}
              <span className="text-amber-600 dark:text-amber-400">think</span>?
            </h1>
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ask a question and get instant AI-simulated responses from real
            demographic profiles in any US location.
          </p>
          <HeroSurveyForm />
          <p className="text-sm text-muted-foreground/70">
            Free to try — no account needed. 3 surveys per day, 25 respondents each.
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-20 px-4 bg-gradient-to-b from-amber-50/60 to-background dark:from-amber-950/10 dark:to-background">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">Simple workflow</p>
            <h2 className="text-3xl md:text-4xl font-bold font-serif">
              How it works
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 stagger-children">
            <Card className="group">
              <CardContent className="pt-8 pb-8 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-lg font-bold text-amber-700 dark:text-amber-400 border border-amber-500/10 transition-colors duration-200 group-hover:bg-amber-500/20">
                  1
                </div>
                <h3 className="text-xl font-semibold font-serif">Ask your question</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Type any statement or question you want to test with a
                  representative sample of Americans.
                </p>
              </CardContent>
            </Card>
            <Card className="group">
              <CardContent className="pt-8 pb-8 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-lg font-bold text-amber-700 dark:text-amber-400 border border-amber-500/10 transition-colors duration-200 group-hover:bg-amber-500/20">
                  2
                </div>
                <h3 className="text-xl font-semibold font-serif">Pick a location</h3>
                <p className="text-muted-foreground leading-relaxed">
                  Choose a ZIP code, state, or congressional district. Responses
                  come from real demographic profiles calibrated to that area.
                </p>
              </CardContent>
            </Card>
            <Card className="group">
              <CardContent className="pt-8 pb-8 space-y-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-lg font-bold text-amber-700 dark:text-amber-400 border border-amber-500/10 transition-colors duration-200 group-hover:bg-amber-500/20">
                  3
                </div>
                <h3 className="text-xl font-semibold font-serif">Get insights</h3>
                <p className="text-muted-foreground leading-relaxed">
                  See distribution charts, demographic breakdowns, and
                  individual responses. Export to CSV for further analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-medium uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">Capabilities</p>
            <h2 className="text-3xl md:text-4xl font-bold font-serif">Features</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 stagger-children">
            {[
              "Real demographic profiles from US Census microdata",
              "Target any ZIP code, state, or congressional district",
              "Likert scale and open-ended response formats",
              "Rich demographics: age, sex, race, occupation, income, housing",
              "Export raw data to CSV for further analysis",
              "Free tier: no sign-up required",
              "Powered by GPT-5 and GPT-5 Mini",
              "Fast results — typically under a minute",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-3 p-4 rounded-xl bg-card border border-amber-900/[0.04] transition-colors duration-200 hover:bg-amber-50/50 dark:hover:bg-amber-950/20 dark:border-amber-100/[0.04]">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <span className="text-sm leading-relaxed">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-b from-amber-50/60 to-background dark:from-amber-950/10 dark:to-background">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold font-serif">Want more?</h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Sign up for an account to run larger surveys with up to 1,000
            respondents and access premium AI models.
          </p>
          <LoginButton />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-4 border-t border-amber-900/[0.06]">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <span>&copy; {new Date().getFullYear()} HiveSight</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <Link href="/privacy" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-amber-700 dark:hover:text-amber-400 transition-colors duration-200">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
