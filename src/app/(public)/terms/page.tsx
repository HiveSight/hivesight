import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "Terms for using HiveSight, including acceptable use, credits, generated output, and service limitations.",
};

const LAST_UPDATED = "March 20, 2026";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-honeycomb">
      <PublicHeader
        rightSlot={
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-muted-foreground transition-colors duration-200 hover:text-amber-700 dark:hover:text-amber-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        }
      />

      <main className="px-4 py-16">
        <div className="mx-auto max-w-3xl space-y-10">
          <div className="space-y-4">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-600 dark:text-amber-400">
              Legal
            </p>
            <div className="space-y-3">
              <h1 className="text-4xl font-bold leading-tight md:text-5xl">
                Terms
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                HiveSight provides AI-generated opinion simulations for research,
                prototyping, and exploratory analysis. Use of the service is
                subject to the rules below.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Last updated {LAST_UPDATED}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Research tool, not a poll</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                HiveSight simulates responses from modeled personas. Outputs are
                not a substitute for live polling, legal advice, medical advice,
                or any other professional service, and they may be incomplete or
                wrong.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Acceptable use</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground md:text-base">
                <li>Use the service lawfully and in line with platform and provider policies.</li>
                <li>Do not submit malicious, abusive, or rights-violating content.</li>
                <li>Do not attempt to disrupt the service, bypass limits, or extract infrastructure secrets.</li>
                <li>Do not represent HiveSight outputs as verified survey data when they are simulated results.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Accounts, credits, and paid usage</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                Some features require an account or paid credits. Credits are
                consumed when survey runs use paid capacity. Pricing, limits,
                and included balances are defined in the product experience at
                the time of use or purchase.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Generated output</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                You are responsible for reviewing and deciding how to use the
                outputs you generate. HiveSight may apply limits, moderation,
                or guardrails to prompts and responses in order to operate the
                service safely.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Availability and changes</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                The service may change over time, including supported models,
                limits, pricing, and product features. HiveSight may suspend or
                stop access for abuse, security issues, or repeated violations
                of these terms.
              </p>
            </section>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
