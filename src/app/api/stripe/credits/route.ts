import { createClient } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { CREDIT_PRICE_CENTS } from "@/types";
import type { Database } from "@/types/database";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

const CreditPurchaseSchema = z.object({
  credits: z.number().min(10).max(10000),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = CreditPurchaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid credit amount (10-10,000)" },
        { status: 400 }
      );
    }

    const { credits } = parsed.data;
    const amountCents = credits * CREDIT_PRICE_CENTS;

    // Get or create Stripe customer
    const { data: profileData } = await supabase
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    const profile = profileData as Pick<
      Profile,
      "stripe_customer_id" | "email"
    > | null;

    let customerId = profile?.stripe_customer_id;

    const stripe = getStripeClient();

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email || user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId } as never)
        .eq("id", user.id);
    }

    // Create checkout session for one-time payment
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${credits} Credits`,
              description: `HiveSight credits for AI survey responses`,
            },
            unit_amount: amountCents,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?purchase=success&credits=${credits}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/credits?purchase=cancelled`,
      metadata: {
        supabase_user_id: user.id,
        type: "credit_purchase",
        credits: credits.toString(),
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("Credit purchase error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
