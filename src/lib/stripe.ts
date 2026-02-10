import Stripe from "stripe";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion,
  });
}

// Lazy-load stripe to avoid errors at build time
let _stripe: Stripe | null = null;
export function getStripeClient() {
  if (!_stripe) {
    _stripe = getStripe();
  }
  return _stripe;
}

// For backwards compatibility - but this will error if key not set
export const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-01-28.clover" as Stripe.LatestApiVersion })
  : (null as unknown as Stripe);

export const STRIPE_PRICE_IDS = {
  basic: process.env.STRIPE_PRICE_BASIC || "price_basic",
  premium: process.env.STRIPE_PRICE_PREMIUM || "price_premium",
} as const;

