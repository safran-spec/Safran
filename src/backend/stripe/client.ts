import "server-only";

import Stripe from "stripe";
import { UnavailableError } from "@/backend/errors";
import {
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/backend/stripe/config";

export { getStripeWebhookSecret, isStripeConfigured };

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new UnavailableError(
      "payment_unavailable",
      "Online-Zahlung ist derzeit nicht verfügbar.",
    );
  }
  if (!stripe) {
    stripe = new Stripe(key);
  }
  return stripe;
}
