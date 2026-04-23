import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { LoginButton } from "@/components/auth/login-button";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  Check,
  Landmark,
  Map,
  MapPin,
  MessageSquareQuote,
  RotateCcw,
  Users2,
} from "lucide-react";
import Link from "next/link";
import { HeroSurveyForm } from "@/components/survey/hero-survey-form";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

const AUDIENCES = ["Marketers", "Product teams", "Researchers", "Campaigns"];

const HERO_POINTS: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "Geography-first",
    description:
      "Target a ZIP code, state, district, or national audience and compare where the same claim lands or breaks.",
    icon: MapPin,
  },
  {
    title: "Scales with the question",
    description:
      "Start with a free run, then scale sample size and model quality when the decision needs more precision.",
    icon: Users2,
  },
  {
    title: "Richer than location",
    description:
      "Each run is grounded in income, occupation, housing, family, disability, insurance, and benefits data.",
    icon: BarChart3,
  },
];

const PLACE_LENSES: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "ZIP code lens",
    description:
      "Catch neighborhood effects where rent burden, commute patterns, and local identity reshape the same line.",
    icon: MapPin,
  },
  {
    title: "State lens",
    description:
      "Compare statewide framing when the coalition is broad and the household mix shifts across metros, suburbs, and rural places.",
    icon: Map,
  },
  {
    title: "District lens",
    description:
      "Read a congressional seat through constituent composition, not just party label or topline vote share.",
    icon: Landmark,
  },
];

const MICRODATA_TRAITS = [
  "Income",
  "Occupation",
  "Housing tenure",
  "Family structure",
  "Disability",
  "Insurance",
  "Benefits",
] as const;

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Write the line",
    description:
      "Start with the claim, concept, headline, product description, or question you want to pressure-test.",
  },
  {
    step: "02",
    title: "Choose the geography",
    description:
      "Start with ZIP code, state, congressional district, or the full US. HiveSight switches to the calibrated population for that place rather than reweighting a generic national sample after the fact.",
  },
  {
    step: "03",
    title: "Read the breakpoints",
    description:
      "Inspect place-level shifts, audience composition, and raw responses to see where the local population actually changes the result.",
  },
] as const;

const DOSSIER_PANELS: Array<{
  title: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    title: "Topline sentiment",
    description:
      "Get the fast read first so you can see whether the message is broadly working or failing.",
    icon: BarChart3,
  },
  {
    title: "Respondent-level reasoning",
    description:
      "Read individual answers in context instead of treating the output like a single summary blob.",
    icon: MessageSquareQuote,
  },
  {
    title: "Audience composition",
    description:
      "See the mix by age, sex, race/ethnicity, occupation, housing, insurance, and benefits context.",
    icon: Users2,
  },
  {
    title: "Fast reruns",
    description:
      "Change the line or the geography and rerun quickly before you move into expensive research.",
    icon: RotateCcw,
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-editorial-paper">
      <PublicHeader rightSlot={<LoginButton />} />

      <section className="relative overflow-hidden px-4 pb-24 pt-12 md:pb-28 md:pt-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,_hsla(42,100%,62%,0.09),_transparent_34%),radial-gradient(circle_at_100%_10%,_hsla(10,84%,60%,0.07),_transparent_20%)]" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
            <div className="space-y-8 pt-4">
              <div className="inline-flex items-center rounded-full border border-amber-950/10 bg-background/85 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 shadow-warm-sm dark:border-amber-100/10 dark:bg-amber-950/20 dark:text-amber-300">
                Audience research desk
              </div>

              <div className="space-y-5">
                <h1 className="max-w-4xl text-5xl font-bold leading-[0.94] tracking-tight md:text-7xl">
                  Audience research grounded in real data, delivered at synthetic speed.
                </h1>
                <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
                  HiveSight lets marketers, product teams, campaigns, and
                  researchers ask synthetic audiences the same questions they
                  would ask human respondents. Start with geography, read the
                  calibrated population underneath it, and act on the result.
                </p>
              </div>

              <div className="max-w-xl rounded-[1.75rem] border border-amber-950/10 bg-background/80 p-5 shadow-editorial">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                  Use it for
                </p>
                <p className="mt-3 text-lg leading-relaxed">
                  Testing messages, products, positioning, and targeting
                  decisions without waiting weeks for fieldwork.
                </p>
              </div>

              <div className="flex flex-wrap gap-2.5">
                {AUDIENCES.map((audience) => (
                  <span
                    key={audience}
                    className="rounded-full border border-amber-950/10 bg-background/75 px-3 py-1.5 text-sm text-foreground/80 shadow-warm-sm dark:border-amber-100/10 dark:bg-amber-950/20"
                  >
                    {audience}
                  </span>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {HERO_POINTS.map(({ title, description, icon: Icon }) => (
                  <div
                    key={title}
                    className="rounded-[1.6rem] border border-amber-950/10 bg-background/82 p-4 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20"
                  >
                    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <Button asChild size="lg" className="gap-2">
                  <Link href="#try-it">
                    Open the research desk
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#how-it-works">Inspect the workflow</Link>
                </Button>
              </div>

              <div className="flex flex-wrap gap-4 text-sm font-medium">
                <Link
                  href="/benchmarks"
                  className="inline-flex text-amber-700 transition-colors duration-200 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
                >
                  Read the benchmark plan
                </Link>
                <Link
                  href="/thesis"
                  className="inline-flex text-amber-700 transition-colors duration-200 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-200"
                >
                  Read the research thesis
                </Link>
              </div>

              <p className="text-sm text-muted-foreground/80">
                Free to try. No account required. Three runs per day with 25
                respondents each, then larger hives and paid models when you
                want more precision.
              </p>
            </div>

            <div id="try-it" className="space-y-4 lg:pl-10">
              <div className="max-w-sm rounded-[1.6rem] border border-amber-950/10 bg-amber-50/90 p-4 shadow-editorial sm:ml-auto dark:border-amber-100/10 dark:bg-amber-950/30">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                  Free access
                </p>
                <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                  Use the full workflow free. Sign in only when you want larger
                  samples, saved work, or paid models.
                </p>
              </div>

              <div className="space-y-3 rounded-[2rem] border border-amber-950/10 bg-background/80 p-5 shadow-editorial backdrop-blur-md md:p-6 dark:border-amber-100/10 dark:bg-amber-950/20">
                <div className="space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                    Live research desk
                  </p>
                  <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
                    Ask the question. Pick the audience. Read the break.
                  </h2>
                  <p className="max-w-xl text-base leading-relaxed text-muted-foreground">
                    Start with a free 25-person Likert run. Scale sample size
                    and model strength when the question calls for more
                    precision.
                  </p>
                </div>
                <HeroSurveyForm />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[1.55rem] border border-amber-950/10 bg-background/82 p-4 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                    Good for
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                    Messages, concepts, product ideas, pricing language,
                    customer questions, and segment strategy.
                  </p>
                </div>
                <div className="rounded-[1.55rem] border border-amber-950/10 bg-background/82 p-4 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                    What to watch
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-foreground/85">
                    When the answer changes by place or subgroup, that is a
                    targeting insight, not a warning label.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl rounded-[2.3rem] border border-amber-950/10 bg-background/80 p-6 shadow-editorial md:p-8 dark:border-amber-100/10 dark:bg-amber-950/20">
          <div className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr] lg:items-start">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                Audience model
              </p>
              <h2 className="text-3xl font-bold md:text-5xl">
                Start with geography. Read the audience underneath it.
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                Geography is the clearest first cut. But each run starts from a
                geography-assigned calibrated population built from household,
                demographic, and socioeconomic microdata, so the output is more
                than a map pin.
              </p>
            </div>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3 stagger-children">
                {PLACE_LENSES.map(({ title, description, icon: Icon }, index) => (
                  <div
                    key={title}
                    className={`rounded-[1.7rem] border border-amber-950/10 p-5 shadow-editorial dark:border-amber-100/10 ${
                      index === 1
                        ? "bg-gradient-to-br from-amber-100/85 to-background dark:from-amber-900/20 dark:to-background"
                        : "bg-background/78 dark:bg-amber-950/20"
                    }`}
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-xl font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
                      {description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="rounded-[1.8rem] border border-amber-950/10 bg-background/78 p-5 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                  Under the hood
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground/85 md:text-base">
                  HiveSight starts by place because that is the fastest real
                  question to ask. Underneath, it runs on a calibrated local
                  population instead of bolting local weights onto a generic
                  audience after the fact.
                </p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  {MICRODATA_TRAITS.map((trait) => (
                    <span
                      key={trait}
                      className="rounded-full border border-amber-950/10 bg-background/85 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-foreground/80 shadow-warm-sm dark:border-amber-100/10 dark:bg-amber-950/30"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="bg-gradient-to-b from-amber-50/65 to-transparent px-4 py-20 dark:from-amber-950/10 dark:to-transparent"
      >
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
            <div className="space-y-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                Method
              </p>
              <h2 className="text-3xl font-bold md:text-5xl">
                How the research desk works.
              </h2>
              <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                The goal is usable signal strong enough to make real decisions,
                fast enough to keep up with the work.
              </p>
              <div className="rounded-[1.7rem] border border-amber-950/10 bg-background/78 p-5 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-700 dark:text-amber-300">
                  Why it matters
                </p>
                <p className="mt-3 text-sm leading-6 text-foreground/85 md:text-base">
                  If a line only works in one place or one slice of the
                  audience, that is not noise. It tells you where the strategy,
                  offer, or message holds and where it breaks.
                </p>
              </div>
            </div>

            <div className="space-y-4 stagger-children">
              {WORKFLOW_STEPS.map(({ step, title, description }) => (
                <div
                  key={step}
                  className="rounded-[1.9rem] border border-amber-950/10 bg-background/78 p-6 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20 md:p-7"
                >
                  <div className="grid gap-4 md:grid-cols-[110px_1fr] md:items-start">
                    <div className="text-4xl font-bold leading-none text-amber-700/75 dark:text-amber-300/75">
                      {step}
                    </div>
                    <div>
                      <h3 className="text-2xl font-semibold">{title}</h3>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground md:text-base">
                        {description}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
            <div className="rounded-[2.2rem] border border-amber-950/10 bg-gradient-to-br from-background/90 via-background/80 to-amber-50/70 p-6 shadow-editorial md:p-8 dark:border-amber-100/10 dark:from-amber-950/20 dark:via-amber-950/10 dark:to-amber-900/10">
              <div className="max-w-2xl space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                  Output
                </p>
                <h2 className="text-3xl font-bold md:text-5xl">
                  Inside each run.
                </h2>
                <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
                  You get enough structure to decide what is working, what
                  breaks, and which parts of the audience are driving the
                  result.
                </p>
              </div>
              <div className="mt-8 grid gap-4 md:grid-cols-2 stagger-children">
                {DOSSIER_PANELS.map(({ title, description, icon: Icon }) => (
                  <div
                    key={title}
                    className="rounded-[1.65rem] border border-amber-950/10 bg-background/78 p-5 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-700 dark:text-amber-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg font-semibold">{title}</h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[2rem] bg-amber-600 p-6 text-amber-50 shadow-editorial md:p-8 dark:bg-amber-500 dark:text-amber-950">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em]">
                  Use it to decide
                </p>
                <h3 className="mt-4 text-3xl font-bold leading-tight md:text-4xl">
                  For many workflows, HiveSight can be the primary research layer.
                </h3>
                <p className="mt-4 text-base leading-relaxed text-amber-50/85 dark:text-amber-950/80">
                  Use it for messaging, marketing, product, editorial, and
                  targeting decisions. The strength is direct inference on a
                  calibrated local population, not a generic persona layer with
                  geography sprinkled on top.
                </p>
              </div>

              <div className="rounded-[2rem] border border-amber-950/10 bg-background/80 p-6 shadow-editorial dark:border-amber-100/10 dark:bg-amber-950/20">
                <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
                  Where it helps
                </p>
                <div className="mt-4 space-y-4">
                  {[
                    "Message testing before ad spend, launch, or campaign rollout.",
                    "Concept and feature research before roadmap or creative commits.",
                    "Segment and geography calibration before full distribution.",
                  ].map((item) => (
                    <div key={item} className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/85">
                        {item}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-24">
        <div className="mx-auto max-w-5xl rounded-[2.2rem] border border-amber-950/10 bg-background/82 p-8 shadow-editorial md:p-12 dark:border-amber-100/10 dark:bg-amber-950/20">
          <div className="space-y-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700 dark:text-amber-300">
              Next move
            </p>
            <h2 className="text-3xl font-bold md:text-5xl">
              Open the desk now. Scale when the decision needs more precision.
            </h2>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Many questions can be answered here. When you want more
              confidence, larger hives and paid models are already in the same
              workflow.
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="gap-2">
              <Link href="#try-it">
                Open the research desk
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <LoginButton />
          </div>
          <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
            {[
              "Target ZIP codes, states, districts, or the full US.",
              "Start free and scale sample size or model quality as needed.",
              "Inspect audience composition and raw responses grounded in a calibrated local population.",
            ].map((item) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-[1.5rem] border border-amber-950/10 bg-background/72 p-4 shadow-warm-sm dark:border-amber-100/10 dark:bg-amber-950/20"
              >
                <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
                  <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-sm leading-relaxed">{item}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
