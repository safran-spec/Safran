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
export function paymentIntentIncludesTwint(intent: Stripe.PaymentIntent) {
  return (intent.payment_method_types ?? []).includes("twint");
}

export async function createOrderPaymentIntent(input: {
  checkoutDraftId?: string;
  orderId?: string;
  orderNumber: string;
  confirmationToken: string;
  totalChf: number;
  customerEmail: string;
  /** Bump when regenerating after payment-method settings change (e.g. TWINT). */
  idempotencySuffix?: string;
}): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  const amount = chfToStripeAmount(input.totalChf);
  const baseKey = input.checkoutDraftId ?? input.orderId;
  if (!baseKey) {
    throw new Error("A checkout draft or legacy order id is required.");
  }
  const idempotencyKey = input.idempotencySuffix
    ? `${baseKey}:${input.idempotencySuffix}`
    : baseKey;

  // Stripe CHF minimum is 0.50 (50 Rappen). Reject early with a clear log.
  if (!Number.isFinite(amount) || amount < 50) {
    console.error("[stripe] amount below CHF 0.50 minimum", {
      totalChf: input.totalChf,
      amount,
      checkoutDraftId: input.checkoutDraftId,
      orderNumber: input.orderNumber,
    });
    throw new Error(
      `Order total is too low for Stripe payment (CHF ${input.totalChf}, min 0.50).`,
    );
  }

  return stripe.paymentIntents.create(
    {
      amount,
      currency: "chf",
      // Card + TWINT (and other CHF methods) once enabled in Stripe Dashboard.
      // TWINT needs redirects — do not set allow_redirects to "never".
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "always",
      },
      receipt_email: input.customerEmail,
      description: `Bestellung ${input.orderNumber} — Safran`,
      metadata: {
        ...(input.checkoutDraftId
          ? { checkout_draft_id: input.checkoutDraftId }
          : { order_id: input.orderId ?? "" }),
        order_number: input.orderNumber,
        confirmation_token: input.confirmationToken,
      },
    },
    { idempotencyKey },
  );
}

export async function retrievePaymentIntent(paymentIntentId: string) {
  return getStripe().paymentIntents.retrieve(paymentIntentId, {
    expand: ["payment_method"],
  });
}

export async function cancelPaymentIntent(paymentIntentId: string) {
  try {
    await getStripe().paymentIntents.cancel(paymentIntentId);
  } catch (error) {
    console.warn("[stripe] cancel PaymentIntent failed", {
      paymentIntentId,
      error,
    });
  }
}

/** Normalize Stripe wallet/card type for our orders.payment_method column. */
export function stripePaymentMethodForOrder(
  intent: Stripe.PaymentIntent,
): "card" | "twint" {
  const pm = intent.payment_method;
  const type =
    typeof pm === "object" && pm && "type" in pm
      ? String((pm as Stripe.PaymentMethod).type)
      : "";
  return type === "twint" ? "twint" : "card";
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
