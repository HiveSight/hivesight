import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PublicFooter } from "@/components/public/public-footer";
import { PublicHeader } from "@/components/public/public-header";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "How HiveSight handles account data, survey prompts, generated responses, and infrastructure logs.",
};

const LAST_UPDATED = "March 20, 2026";

export default function PrivacyPage() {
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
                Privacy
              </h1>
              <p className="max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">
                HiveSight stores the information needed to run surveys, display
                results, manage accounts, and protect the service from abuse.
              </p>
              <p className="text-sm text-muted-foreground/80">
                Last updated {LAST_UPDATED}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">What HiveSight collects</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground md:text-base">
                <li>Account details from authentication providers, such as email address and user ID.</li>
                <li>Survey inputs you submit, including question text, location settings, model choice, and response format.</li>
                <li>Generated outputs, including simulated responses, reasoning, and summary statistics.</li>
                <li>Operational data such as IP-based rate-limit records, billing metadata, and server logs.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">How the data is used</h2>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground md:text-base">
                <li>To create and store survey runs so you can revisit results later.</li>
                <li>To enforce free-tier limits, protect the app, and investigate operational failures.</li>
                <li>To process payments and credit balances for paid usage.</li>
                <li>To send prompts to model providers so HiveSight can generate simulated responses.</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Third-party services</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                HiveSight relies on infrastructure providers to authenticate
                users, store application data, process payments, and generate
                model output. Those providers may receive the minimum data
                required to perform their role.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Retention and control</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                Survey records and account metadata remain in service systems for
                product operation, auditing, and abuse prevention. If you access
                HiveSight through an authenticated account, use the account or
                support workflow available to you for questions about stored
                data.
              </p>
            </section>

            <section className="rounded-2xl border border-amber-900/[0.06] bg-card/80 p-6 shadow-warm-sm">
              <h2 className="text-2xl font-semibold">Important note</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground md:text-base">
                HiveSight is a research tool. Avoid submitting confidential,
                regulated, or highly sensitive personal information in survey
                prompts or free-text responses.
              </p>
            </section>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
