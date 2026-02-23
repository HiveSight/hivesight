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
    <div className="min-h-screen">
      {/* Header */}
      <header className="py-4 px-4 border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Hexagon className="h-8 w-8 text-amber-500 fill-amber-500/20" />
            <span className="text-xl font-bold">HiveSight</span>
          </Link>
          <LoginButton />
        </div>
      </header>

      {/* Hero Section with functional survey input */}
      <section className="relative py-16 px-4">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
            What do the people in your area think?
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Ask a question and get instant AI-simulated responses from real
            demographic profiles in any US location.
          </p>
          <HeroSurveyForm />
          <p className="text-sm text-muted-foreground">
            Free to try — no account needed. 3 surveys per day, 25 respondents each.
          </p>
        </div>
      </section>

      {/* How it Works */}
      <section id="how-it-works" className="py-16 px-4 bg-muted/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  1
                </div>
                <h3 className="text-xl font-semibold">Ask your question</h3>
                <p className="text-muted-foreground">
                  Type any statement or question you want to test with a
                  representative sample of Americans.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  2
                </div>
                <h3 className="text-xl font-semibold">Pick a location</h3>
                <p className="text-muted-foreground">
                  Choose a ZIP code, state, or congressional district. Responses
                  come from real demographic profiles calibrated to that area.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold">
                  3
                </div>
                <h3 className="text-xl font-semibold">Get insights</h3>
                <p className="text-muted-foreground">
                  See distribution charts, demographic breakdowns, and
                  individual responses. Export to CSV for further analysis.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Features</h2>
          <div className="grid md:grid-cols-2 gap-6">
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
              <div key={feature} className="flex items-center gap-3">
                <Check className="h-5 w-5 text-green-500 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="max-w-xl mx-auto text-center space-y-6">
          <h2 className="text-3xl font-bold">Want more?</h2>
          <p className="text-muted-foreground">
            Sign up for an account to run larger surveys with up to 1,000
            respondents and access premium AI models.
          </p>
          <LoginButton />
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Hexagon className="h-5 w-5 text-amber-500 fill-amber-500/20" />
            <span>&copy; {new Date().getFullYear()} HiveSight</span>
          </div>
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
