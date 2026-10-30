import { NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  completeStripeCheckoutDraftFromStripe,
  markOrderPaidFromStripe,
} from "@/backend/services/order.service";
import {
  getStripe,
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/backend/stripe/client";

export const runtime = "nodejs";

/**
 * Stripe → us. Source of truth for online payment success.
 * Local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 *
 * Events: `payment_intent.succeeded` (embedded page) and
 * `checkout.session.completed` (legacy hosted Checkout).
 */
export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: "stripe_not_configured" },
      { status: 503 },
    );
  }

  const secret = getStripeWebhookSecret();
  if (!secret) {
    console.error("[stripe] STRIPE_WEBHOOK_SECRET is missing");
    return NextResponse.json(
      { error: "webhook_secret_missing" },
      { status: 503 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;

  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error("[stripe] signature verification failed", error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const draftId = intent.metadata?.checkout_draft_id;
      const confirmationToken = intent.metadata?.confirmation_token;
      if (draftId && confirmationToken) {
        await completeStripeCheckoutDraftFromStripe({
          draftId,
          confirmationToken,
          paymentReference: intent.id,
          amountReceived: intent.amount_received,
          currency: intent.currency,
        });
      }
      const orderId = intent.metadata?.order_id;
      if (!draftId && orderId) {
        await markOrderPaidFromStripe({
          orderId,
          paymentReference: intent.id,
        });
      }
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id;
      if (
        orderId &&
        (session.payment_status === "paid" || session.status === "complete")
      ) {
        await markOrderPaidFromStripe({
          orderId,
          paymentReference: session.id,
        });
      }
    }
  } catch (error) {
    console.error("[stripe] webhook handler failed", error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
