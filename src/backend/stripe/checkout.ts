import "server-only";

import type Stripe from "stripe";
import { getStripe } from "@/backend/stripe/client";

const CHF_CENTS = 100;

export function chfToStripeAmount(totalChf: number): number {
  return Math.round(totalChf * CHF_CENTS);
}

export function getStripePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim() ||
    process.env.STRIPE_PUBLISHABLE_KEY?.trim() ||
    ""
  );
}

/**
 * PaymentIntent for embedded Safran payment page (Payment Element).
 * Menu SKUs stay in our DB — Stripe only charges the order total.
 */
export async function createOrderPaymentIntent(input: {
  orderId: string;
  orderNumber: string;
  confirmationToken: string;
  totalChf: number;
  customerEmail: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const amount = chfToStripeAmount(input.totalChf);

  if (!Number.isFinite(amount) || amount < 50) {
    throw new Error("Order total is too low for Stripe payment.");
  }

  return stripe.paymentIntents.create({
    amount,
    currency: "chf",
    automatic_payment_methods: { enabled: true },
    receipt_email: input.customerEmail,
    description: `Bestellung ${input.orderNumber} — Safran`,
    metadata: {
      order_id: input.orderId,
      order_number: input.orderNumber,
      confirmation_token: input.confirmationToken,
    },
  });
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return getStripe().paymentIntents.retrieve(paymentIntentId);
}

/** @deprecated Prefer PaymentIntent + embedded page; kept for old webhook sessions. */
export async function createOrderCheckoutSession(input: {
  orderId: string;
  orderNumber: string;
  confirmationToken: string;
  totalChf: number;
  customerEmail: string;
  locale: "de" | "en";
  origin: string;
}): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  const origin = input.origin.replace(/\/$/, "");
  const amount = chfToStripeAmount(input.totalChf);

  if (!Number.isFinite(amount) || amount < 50) {
    throw new Error("Order total is too low for Stripe Checkout.");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    locale: input.locale === "en" ? "en" : "de",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "chf",
          unit_amount: amount,
          product_data: {
            name: `Bestellung ${input.orderNumber}`,
            description: "Safran Indisches Restaurant",
          },
        },
      },
    ],
    success_url: `${origin}/bestellung/${input.confirmationToken}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/kasse?payment=cancelled`,
    metadata: {
      order_id: input.orderId,
      order_number: input.orderNumber,
      confirmation_token: input.confirmationToken,
    },
    payment_intent_data: {
      receipt_email: input.customerEmail,
      metadata: {
        order_id: input.orderId,
        order_number: input.orderNumber,
        confirmation_token: input.confirmationToken,
      },
    },
  });
}

export async function retrieveCheckoutSession(sessionId: string) {
  return getStripe().checkout.sessions.retrieve(sessionId);
}
