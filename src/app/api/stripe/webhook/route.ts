import { getStripeClient } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { TIER_CONFIG } from "@/types";

// Use service role key for webhook handler
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "No signature" }, { status: 400 });
  }

  const stripe = getStripeClient();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.supabase_user_id;
        const purchaseType = session.metadata?.type;

        // Handle credit bundle purchase
        if (purchaseType === "credit_purchase" && userId) {
          const credits = parseInt(session.metadata?.credits || "0", 10);
          if (credits > 0) {
            // Get current balance
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("credit_balance")
              .eq("id", userId)
              .single();

            const currentBalance = (profile as { credit_balance: number } | null)?.credit_balance ?? 0;

            // Add credits to balance
            await supabaseAdmin
              .from("profiles")
              .update({
                credit_balance: currentBalance + credits,
              } as never)
              .eq("id", userId);

            // Log credit purchase
            await supabaseAdmin.from("credit_transactions").insert({
              user_id: userId,
              amount: credits,
              type: "purchase",
              description: `Purchased ${credits} credits`,
            } as never);
          }
          break;
        }

        // Handle subscription purchase
        const tier = session.metadata?.tier as "basic" | "premium";
        if (userId && tier) {
          const credits = TIER_CONFIG[tier].monthlyCredits;

          // Update user tier
          await supabaseAdmin
            .from("profiles")
            .update({
              tier,
              credit_balance: credits,
            } as never)
            .eq("id", userId);

          // Log credit grant
          await supabaseAdmin.from("credit_transactions").insert({
            user_id: userId,
            amount: credits,
            type: "grant",
            description: `${tier.charAt(0).toUpperCase() + tier.slice(1)} subscription - monthly credits`,
          } as never);
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = invoice.customer as string;

        // Find user by Stripe customer ID
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, tier")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (profiles && profiles.length > 0) {
          const profile = profiles[0] as { id: string; tier: "free" | "basic" | "premium" };
          const credits = TIER_CONFIG[profile.tier].monthlyCredits;

          // Grant monthly credits
          await supabaseAdmin
            .from("profiles")
            .update({
              credit_balance: credits,
            } as never)
            .eq("id", profile.id);

          await supabaseAdmin.from("credit_transactions").insert({
            user_id: profile.id,
            amount: credits,
            type: "grant",
            description: "Monthly credit renewal",
          } as never);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // Downgrade user to free tier
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .limit(1);

        if (profiles && profiles.length > 0) {
          await supabaseAdmin
            .from("profiles")
            .update({
              tier: "free",
            } as never)
            .eq("id", profiles[0].id);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
