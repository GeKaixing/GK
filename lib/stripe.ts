import Stripe from "stripe";

let _stripe: Stripe | null = null;

/**
 * Lazily construct the Stripe client.
 *
 * The previous `export const stripe = new Stripe(STRIPE_SECRET_KEY!)` evaluated
 * at module scope and threw when the env var was missing — which broke
 * build-time page-data collection for /api/stripe/webhook on deployments whose
 * build env lacks STRIPE_SECRET_KEY. Construct on first request instead; a clear
 * error is raised only if a request actually needs Stripe without a key.
 */
export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key, {
      apiVersion: "2026-01-28.clover",
    });
  }
  return _stripe;
}
