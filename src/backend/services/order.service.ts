import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCapability } from "@/backend/auth/authorize";
import { getOptionalActor } from "@/backend/auth/session";
import { isWithinOpeningHours, zonedNow } from "@/backend/domain/opening-hours";
import {
  assertMinimumOrder,
  calculateOrderTotals,
  discountedPrice,
  lineTotal,
  money,
  type PricedLine,
  type PricingRules,
} from "@/backend/domain/order-pricing";
import {
  allowedTransitionsFor,
  assertTransition,
  autoCompleteCutoff,
  INITIAL_ORDER_STATUS,
  isOrderStatus,
  OPEN_ORDER_STATUSES,
} from "@/backend/domain/order-status";
import type { AppRole } from "@/backend/domain/roles";
import {
  ConflictError,
  NotFoundError,
  UnavailableError,
} from "@/backend/errors";
import * as menuRepository from "@/backend/repositories/menu.repository";
import * as orderRepository from "@/backend/repositories/order.repository";
import * as printJobRepository from "@/backend/repositories/print-job.repository";
import * as settingsRepository from "@/backend/repositories/settings.repository";
import { resolveOrderDeliveryMinimum } from "@/backend/services/delivery-zone.service";
import { enqueueOrderPrintJob } from "@/backend/services/print.service";
import {
  sendOrderNotifyEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
} from "@/backend/services/email.service";
import {
  createOrderPaymentIntent,
  retrieveCheckoutSession,
  retrievePaymentIntent,
} from "@/backend/stripe/checkout";
import { isStripeConfigured } from "@/backend/stripe/config";
import { createServiceClient } from "@/backend/supabase/clients";
import type { CreatedOrder, OrderRequest } from "@/backend/types";
import { assertDeliverableEmail } from "@/backend/validation/email";
import { menuItemNumber } from "@/backend/validation/order";
import { isUuid } from "@/backend/validation/primitives";
import type {
  CheckoutPaymentDraft,
  Database,
  Json,
  OrderStatus,
  PrintJob,
} from "@/types/database";

type Db = SupabaseClient<Database>;

const RESTAURANT_TIMEZONE = "Europe/Zurich";

function trustedClient(): Db {
  try {
    return createServiceClient() as unknown as Db;
  } catch {
    throw new UnavailableError(
      "ordering_unavailable",
      "Bestellungen sind vorübergehend nicht verfügbar.",
    );
  }
}

function shortOrderNumber() {
  const day = new Date().toISOString().slice(5, 10).replace("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 4).toUpperCase();
  return `${day}-${suffix}`;
}

/**
 * Cash orders are created immediately. Card checkouts persist a private draft;
 * the real order is created only after Stripe confirms payment.
 *
 * Everything that decides what the guest pays is read from the database inside
 * this function: unit prices, the delivery fee, minimum order values, whether
 * the store accepts orders and the opening hours. The request only contributes
 * item identifiers, quantities and contact details.
 */
export async function createCashOrder(
  request: OrderRequest,
): Promise<CreatedOrder> {
  const db = trustedClient();
  const payOnline = request.paymentMethod === "card";

  if (payOnline && !isStripeConfigured()) {
    throw new UnavailableError(
      "payment_unavailable",
      "Online-Zahlung ist derzeit nicht verfügbar.",
    );
  }

  await assertDeliverableEmail(request.customer.email);

  const duplicate = await orderRepository.findByIdempotencyKey(
    db,
    request.idempotencyKey,
  );
  if (duplicate.data) {
    return resumeExistingOrder(db, duplicate.data);
  }
  if (payOnline) {
    const draftResult = await orderRepository.findCheckoutDraftByIdempotencyKey(
      db,
      request.idempotencyKey,
    );
    if (draftResult.error) {
      throw new UnavailableError(
        "payment_unavailable",
        "Die Zahlung konnte nicht vorbereitet werden.",
      );
    }
    if (draftResult.data) {
      return resumeCheckoutDraft(db, draftResult.data);
    }
  }

  const itemNumbers = request.items.map((item) => menuItemNumber(item.id));
  const now = zonedNow(RESTAURANT_TIMEZONE);

  // Independent reads, so they run concurrently. The actor lookup is included
  // here rather than awaited later: it costs nothing for a guest with no auth
  // cookie, and for a signed-in customer it overlaps with the menu read instead
  // of adding a round trip to the checkout path.
  const [settingsResult, hoursResult, menuResult, actor] = await Promise.all([
    settingsRepository.findStoreSettings(db),
    settingsRepository.findOpeningHoursForWeekday(db, now.weekday),
    menuRepository.findItemsByNumbers(db, itemNumbers),
    getOptionalActor(),
  ]);

  if (settingsResult.error || !settingsResult.data) {
    throw new UnavailableError(
      "ordering_unavailable",
      "Bestellungen sind vorübergehend nicht verfügbar.",
    );
  }
  const settings = settingsResult.data;

  if (settings.is_open !== true) {
    throw new ConflictError(
      "store_closed",
      settings.closed_message?.slice(0, 200) ||
        "Das Restaurant nimmt derzeit keine Bestellungen an.",
    );
  }
  if (
    (request.fulfillment === "delivery" && settings.delivery_enabled !== true) ||
    (request.fulfillment === "pickup" && settings.pickup_enabled !== true)
  ) {
    throw new ConflictError(
      "fulfillment_unavailable",
      "Die gewählte Bestellart ist derzeit nicht verfügbar.",
    );
  }
  if (hoursResult.error || !isWithinOpeningHours(hoursResult.data, now.time)) {
    throw new ConflictError(
      "store_closed",
      "Das Restaurant ist derzeit geschlossen.",
    );
  }
  if (menuResult.error) {
    throw new UnavailableError(
      "ordering_unavailable",
      "Die Speisekarte konnte nicht geprüft werden.",
    );
  }

  const menu = new Map(
    (menuResult.data ?? []).map((row) => [`menu-${row.item_number}`, row]),
  );
  const lines: PricedLine[] = request.items.map((item) => {
    const current = menu.get(item.id);
    if (!current || current.is_active !== true || !Number.isFinite(Number(current.price))) {
      throw new ConflictError(
        "item_unavailable",
        "Mindestens ein Artikel ist nicht mehr verfügbar.",
      );
    }
    return {
      menuItemId: String(current.id),
      name: current.name,
      quantity: item.quantity,
      // Discounts are applied here, from the database, so the customer is charged
      // the reduced price even if the cart in the browser says otherwise.
      unitPrice: discountedPrice(current.price, current.discount_percent),
    };
  });

  const globalDeliveryMinimum = Number(settings.minimum_order ?? 0);
  const deliveryMinimum =
    request.fulfillment === "delivery"
      ? await resolveOrderDeliveryMinimum(
          db,
          request.address?.postalCode,
          globalDeliveryMinimum,
        )
      : globalDeliveryMinimum;

  const rules: PricingRules = {
    deliveryFee: Number(settings.delivery_fee ?? 0),
    deliveryMinimum,
    pickupMinimum: Number(settings.pickup_minimum ?? 0),
  };
  const totals = calculateOrderTotals(lines, request.fulfillment, rules);
  assertMinimumOrder(totals.subtotal, request.fulfillment, rules);

  // `user_id` comes from the trusted session resolved above, never from the
  // request body, so the future customer app can list "my orders" under RLS.
  // Guests stay anonymous.
  const orderRow = {
    order_number: shortOrderNumber(),
    confirmation_token: crypto.randomUUID(),
    idempotency_key: request.idempotencyKey,
    user_id: actor?.role === "customer" ? actor.userId : null,
    status: INITIAL_ORDER_STATUS,
    fulfillment_type: request.fulfillment,
    payment_status: "pending" as const,
    payment_method: payOnline ? "card" : "cash",
    payment_provider: payOnline ? "stripe" : null,
    accepted_no_cancellation: true,
    customer_name: `${request.customer.firstName} ${request.customer.lastName}`,
    customer_email: request.customer.email,
    customer_phone: request.customer.phone,
    address_line1: request.address
      ? `${request.address.street} ${request.address.houseNumber}`
      : null,
    address_line2: request.address?.locationUrl ?? null,
    postal_code: request.address?.postalCode ?? null,
    city: request.address?.city ?? null,
    delivery_address: request.address
      ? {
          street: request.address.street,
          houseNumber: request.address.houseNumber,
          postalCode: request.address.postalCode,
          city: request.address.city,
          locationUrl: request.address.locationUrl ?? null,
        }
      : null,
    customer_notes: request.notes ?? null,
    locale: request.locale,
    subtotal: totals.subtotal,
    delivery_fee: totals.deliveryFee,
    total: totals.total,
    currency: "CHF",
  };

  const orderLines = lines.map((line) => ({
    menu_item_id: Number(line.menuItemId),
    name: line.name,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    line_total: lineTotal(line),
    notes: null,
  }));

  if (payOnline) {
    const draft = await orderRepository.insertCheckoutDraft(db, {
      idempotency_key: request.idempotencyKey,
      confirmation_token: orderRow.confirmation_token,
      order_data: orderRow as unknown as Json,
      items: orderLines as unknown as Json,
    });

    if (draft.error || !draft.data) {
      const raced = await orderRepository.findCheckoutDraftByIdempotencyKey(
        db,
        request.idempotencyKey,
      );
      if (raced.error || !raced.data) {
        console.error("[stripe] checkout draft creation failed", draft.error);
        throw new UnavailableError(
          "payment_unavailable",
          "Die Zahlung konnte nicht vorbereitet werden.",
        );
      }
      return resumeCheckoutDraft(db, raced.data);
    }

    const chargeTotal = money(totals.total);
    const clientSecret = await startStripePaymentIntent({
      db,
      checkoutDraftId: draft.data.id,
      orderNumber: String(orderRow.order_number),
      confirmationToken: String(orderRow.confirmation_token),
      total: chargeTotal,
      customerEmail: request.customer.email,
    });

    return {
      orderNumber: String(orderRow.order_number),
      confirmationToken: String(orderRow.confirmation_token),
      total: chargeTotal,
      currency: "CHF",
      status: INITIAL_ORDER_STATUS,
      clientSecret,
      paymentMethod: "card",
    };
  }

  const result = await orderRepository.insertOrder(db, orderRow, orderLines);

  if (!result.order) {
    throw new UnavailableError(
      "order_failed",
      "Die Bestellung konnte nicht gespeichert werden.",
    );
  }

  await notifyOrderCreated({
    orderId: result.order.id,
    orderNumber: result.order.order_number,
    confirmationToken: result.order.confirmation_token,
    status: result.order.status,
    fulfillment: request.fulfillment,
    paymentMethod: "cash",
    paidOnline: false,
    total: money(result.order.total),
    locale: request.locale,
    customerName: `${request.customer.firstName} ${request.customer.lastName}`,
    customerEmail: request.customer.email,
    customerPhone: request.customer.phone,
    notes: request.notes ?? null,
    addressLine: request.address
      ? [
          `${request.address.street} ${request.address.houseNumber}`,
          `${request.address.postalCode} ${request.address.city}`,
        ]
          .filter(Boolean)
          .join(", ")
      : null,
    items: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
    db,
  });

  return {
    orderNumber: result.order.order_number,
    confirmationToken: result.order.confirmation_token,
    total: money(result.order.total),
    currency: "CHF",
    status: result.order.status,
    paymentMethod: "cash",
  };
}

async function resumeExistingOrder(
  db: Db,
  row: {
    id: string;
    order_number: string;
    confirmation_token: string;
    total: number | string;
    status: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
    customer_email?: string | null;
    locale?: string | null;
  },
): Promise<CreatedOrder> {
  const paymentMethod = row.payment_method === "card" ? "card" : "cash";
  const base: CreatedOrder = {
    orderNumber: String(row.order_number),
    confirmationToken: String(row.confirmation_token),
    total: money(row.total),
    currency: "CHF",
    status: String(row.status || INITIAL_ORDER_STATUS),
    paymentMethod,
  };

  if (
    paymentMethod === "card" &&
    row.payment_status === "pending" &&
    row.customer_email
  ) {
    const clientSecret = await startStripePaymentIntent({
      db,
      orderId: row.id,
      orderNumber: String(row.order_number),
      confirmationToken: String(row.confirmation_token),
      total: money(row.total),
      customerEmail: row.customer_email,
    });
    return { ...base, clientSecret };
  }

  return base;
}

function checkoutDraftOrderData(draft: CheckoutPaymentDraft) {
  if (
    !draft.order_data ||
    typeof draft.order_data !== "object" ||
    Array.isArray(draft.order_data)
  ) {
    throw new UnavailableError(
      "payment_unavailable",
      "Die Zahlung konnte nicht fortgesetzt werden.",
    );
  }
  return draft.order_data as Record<string, unknown>;
}

async function resumeCheckoutDraft(
  db: Db,
  draft: CheckoutPaymentDraft,
): Promise<CreatedOrder> {
  const data = checkoutDraftOrderData(draft);
  const base: CreatedOrder = {
    orderNumber: String(data.order_number),
    confirmationToken: draft.confirmation_token,
    total: money(data.total),
    currency: "CHF",
    status: INITIAL_ORDER_STATUS,
    paymentMethod: "card",
  };

  if (draft.order_id) return base;

  if (draft.payment_reference) {
    const intent = await retrievePaymentIntent(draft.payment_reference);
    if (intent.status === "succeeded") {
      await completeStripeCheckoutDraftFromStripe({
        draftId: draft.id,
        confirmationToken: draft.confirmation_token,
        paymentReference: intent.id,
        amountReceived: intent.amount_received,
        currency: intent.currency,
      });
      return base;
    }
    if (intent.status === "canceled") {
      throw new UnavailableError(
        "payment_unavailable",
        "Diese Zahlung wurde beendet. Bitte starten Sie den Checkout erneut.",
      );
    }
    if (intent.client_secret) {
      return { ...base, clientSecret: intent.client_secret };
    }
  }

  const clientSecret = await startStripePaymentIntent({
    db,
    checkoutDraftId: draft.id,
    orderNumber: base.orderNumber,
    confirmationToken: draft.confirmation_token,
    total: base.total,
    customerEmail: String(data.customer_email ?? ""),
  });
  return { ...base, clientSecret };
}

async function startStripePaymentIntent(input: {
  db: Db;
  checkoutDraftId?: string;
  orderId?: string;
  orderNumber: string;
  confirmationToken: string;
  total: number;
  customerEmail: string;
}): Promise<string> {
  const totalChf = money(input.total);
  if (totalChf < 0.5) {
    throw new UnavailableError(
      "payment_amount_too_low",
      "Online-Zahlung ist ab CHF 0.50 möglich. Bitte Warenkorb prüfen.",
    );
  }
  if (!input.checkoutDraftId && !input.orderId) {
    throw new UnavailableError(
      "payment_unavailable",
      "Die Zahlung konnte nicht vorbereitet werden.",
    );
  }

  try {
    const intent = await createOrderPaymentIntent({
      ...(input.checkoutDraftId
        ? { checkoutDraftId: input.checkoutDraftId }
        : { orderId: input.orderId }),
      orderNumber: input.orderNumber,
      confirmationToken: input.confirmationToken,
      totalChf,
      customerEmail: input.customerEmail,
    });

    if (!intent.client_secret) {
      throw new UnavailableError(
        "payment_unavailable",
        "Die Zahlungsseite konnte nicht geöffnet werden.",
      );
    }

    const referenceResult = input.checkoutDraftId
      ? await orderRepository.setCheckoutDraftPaymentReference(
          input.db,
          input.checkoutDraftId,
          intent.id,
        )
      : input.orderId
        ? await orderRepository.setPaymentReference(
          input.db,
          input.orderId,
          intent.id,
        )
        : { error: new Error("Missing order or checkout draft id.") };
    if (referenceResult.error) {
      throw new UnavailableError(
        "payment_unavailable",
        "Die Zahlung konnte nicht vorbereitet werden.",
      );
    }
    return intent.client_secret;
  } catch (error) {
    if (error instanceof UnavailableError) throw error;
    console.error("[stripe] payment intent failed", error);
    throw new UnavailableError(
      "payment_unavailable",
      "Die Zahlungsseite konnte nicht geöffnet werden.",
    );
  }
}

/**
 * Loads (or recreates) a PaymentIntent client secret for an unpaid card order.
 * Used by the embedded `/zahlung/[token]` page.
 */
export async function getPaymentClientSecretForToken(
  token: string,
): Promise<{
  clientSecret: string;
  publishableKey: string;
  orderNumber: string;
  total: number;
  currency: "CHF";
  customerEmail: string;
  locale: "de" | "en";
} | null> {
  if (!isStripeConfigured() || !isUuid(token)) return null;

  const { getStripePublishableKey } = await import("@/backend/stripe/checkout");
  const publishableKey = getStripePublishableKey();
  if (!publishableKey) return null;

  const db = trustedClient();
  const orderResult = await orderRepository.findByConfirmationToken(db, token);
  if (orderResult.error) {
    throw new UnavailableError(
      "payment_unavailable",
      "Der Zahlungsstatus konnte nicht geladen werden.",
    );
  }
  const order = orderResult.data;
  if (order) {
    if (
      String(order.payment_method ?? "") !== "card" ||
      String(order.payment_status ?? "") === "paid"
    ) {
      return null;
    }

    const full = await orderRepository.findOrderById(db, order.id);
    const row = full.data;
    if (!row?.customer_email) return null;

    const existingRef = row.payment_reference;
    if (existingRef && /^pi_/.test(existingRef)) {
      try {
        const existing = await retrievePaymentIntent(existingRef);
        if (
          existing.client_secret &&
          (existing.status === "requires_payment_method" ||
            existing.status === "requires_confirmation" ||
            existing.status === "requires_action")
        ) {
          return {
            clientSecret: existing.client_secret,
            publishableKey,
            orderNumber: row.order_number,
            total: money(row.total),
            currency: "CHF",
            customerEmail: row.customer_email,
            locale: row.locale === "en" ? "en" : "de",
          };
        }
        if (existing.status === "succeeded") {
          await markOrderPaidFromStripe({
            orderId: row.id,
            paymentReference: existing.id,
          });
          return null;
        }
      } catch (error) {
        console.error("[stripe] retrieve PI failed", error);
      }
    }

    const clientSecret = await startStripePaymentIntent({
      db,
      orderId: row.id,
      orderNumber: row.order_number,
      confirmationToken: row.confirmation_token,
      total: money(row.total),
      customerEmail: row.customer_email,
    });

    return {
      clientSecret,
      publishableKey,
      orderNumber: row.order_number,
      total: money(row.total),
      currency: "CHF",
      customerEmail: row.customer_email,
      locale: row.locale === "en" ? "en" : "de",
    };
  }

  const draftResult = await orderRepository.findCheckoutDraftByToken(db, token);
  if (draftResult.error) {
    throw new UnavailableError(
      "payment_unavailable",
      "Der Zahlungsstatus konnte nicht geladen werden.",
    );
  }
  const draft = draftResult.data;
  if (!draft || draft.order_id) return null;

  const data = checkoutDraftOrderData(draft);
  const email = String(data.customer_email ?? "");
  const total = money(data.total);
  const orderNumber = String(data.order_number ?? "");
  const locale = data.locale === "en" ? "en" : "de";

  if (draft.payment_reference) {
    try {
      const existing = await retrievePaymentIntent(draft.payment_reference);
      if (existing.status === "succeeded") {
        await completeStripeCheckoutDraftFromStripe({
          draftId: draft.id,
          confirmationToken: draft.confirmation_token,
          paymentReference: existing.id,
          amountReceived: existing.amount_received,
          currency: existing.currency,
        });
        return null;
      }
      if (existing.status === "canceled") return null;
      if (existing.client_secret) {
        return {
          clientSecret: existing.client_secret,
          publishableKey,
          orderNumber,
          total,
          currency: "CHF",
          customerEmail: email,
          locale,
        };
      }
    } catch (error) {
      console.error("[stripe] retrieve checkout draft payment failed", error);
      throw new UnavailableError(
        "payment_unavailable",
        "Der Zahlungsstatus konnte nicht geladen werden.",
      );
    }
  }

  const clientSecret = await startStripePaymentIntent({
    db,
    checkoutDraftId: draft.id,
    orderNumber,
    confirmationToken: draft.confirmation_token,
    total,
    customerEmail: email,
  });

  return {
    clientSecret,
    publishableKey,
    orderNumber,
    total,
    currency: "CHF",
    customerEmail: email,
    locale,
  };
}

async function notifyOrderCreated(input: {
  orderId: string;
  orderNumber: string;
  confirmationToken: string;
  status: string;
  fulfillment: "delivery" | "pickup";
  paymentMethod?: "cash" | "card";
  total: number;
  locale: "de" | "en";
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  notes: string | null;
  addressLine: string | null;
  items: Array<{ name: string; quantity: number; unitPrice: number }>;
  db: Db;
  paidOnline?: boolean;
}) {
  void enqueueOrderPrintJob({
    orderId: input.orderId,
    triggerSource: "order_created",
    db: input.db,
  });

  // Guest receipt first and awaited — fire-and-forget was dropping it while
  // the kitchen notify (same Resend account owner) still arrived.
  if (input.customerEmail.trim()) {
    try {
      await sendOrderPlacedEmail({
        to: input.customerEmail.trim(),
        customerName: input.customerName,
        orderNumber: input.orderNumber,
        confirmationToken: input.confirmationToken,
        fulfillmentType: input.fulfillment,
        total: input.total,
        status: input.status,
        locale: input.locale,
        paidOnline: input.paidOnline,
      });
    } catch (error) {
      console.error("[email] guest receipt failed", {
        to: input.customerEmail,
        orderNumber: input.orderNumber,
        error,
      });
    }
  } else {
    console.warn("[email] guest receipt skipped — empty customer email", {
      orderNumber: input.orderNumber,
    });
  }

  try {
    await sendOrderNotifyEmail({
      orderNumber: input.orderNumber,
      orderId: input.orderId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      fulfillmentType: input.fulfillment,
      paymentMethod: input.paymentMethod ?? (input.paidOnline ? "card" : "cash"),
      paidOnline: input.paidOnline === true,
      total: input.total,
      notes: input.notes,
      addressLine: input.addressLine,
      items: input.items,
    });
  } catch (error) {
    console.error("[email] kitchen notify failed", error);
  }
}

/**
 * Marks a Stripe-paid order as paid and runs print + emails once.
 * Safe to call from the webhook and from the success-page sync.
 */
export async function markOrderPaidFromStripe(input: {
  orderId: string;
  paymentReference: string;
}): Promise<boolean> {
  const db = trustedClient();
  const updated = await orderRepository.markOrderPaid(
    db,
    input.orderId,
    input.paymentReference,
  );

  if (updated.error) {
    console.error("[stripe] mark paid failed", updated.error);
    return false;
  }
  if (!updated.data) {
    // Already paid or unknown id — treat as success for idempotent webhooks.
    return true;
  }

  const order = updated.data;
  const itemsResult = await orderRepository.findOrderItems(db, order.id);
  const fulfillment =
    order.fulfillment_type === "pickup" ? "pickup" : "delivery";
  const addressLine = [order.address_line1, order.postal_code, order.city]
    .filter(Boolean)
    .join(", ");

  await notifyOrderCreated({
    orderId: order.id,
    orderNumber: order.order_number,
    confirmationToken: order.confirmation_token,
    status: order.status,
    fulfillment,
    paymentMethod: "card",
    total: money(order.total),
    locale: order.locale === "en" ? "en" : "de",
    customerName: order.customer_name || "Gast",
    customerEmail: order.customer_email || "",
    customerPhone: order.customer_phone || "",
    notes: order.customer_notes,
    addressLine: addressLine || null,
    items: (itemsResult.data ?? []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: money(item.unit_price),
    })),
    db,
    paidOnline: true,
  });

  return true;
}

/** Creates the real order only after Stripe confirms the draft is fully paid. */
export async function completeStripeCheckoutDraftFromStripe(input: {
  draftId: string;
  confirmationToken: string;
  paymentReference: string;
  amountReceived: number;
  currency: string;
}): Promise<boolean> {
  if (!isUuid(input.draftId) || !isUuid(input.confirmationToken)) {
    throw new UnavailableError(
      "checkout_draft_invalid",
      "Die Zahlung konnte keiner Bestellung zugeordnet werden.",
    );
  }

  const db = trustedClient();
  const completion = await orderRepository.completeStripeCheckoutDraft(db, input);
  if (completion.error || !completion.order) {
    console.error("[stripe] checkout draft completion failed", completion.error);
    throw new UnavailableError(
      "checkout_completion_failed",
      "Die bezahlte Bestellung konnte nicht abgeschlossen werden.",
    );
  }
  if (!completion.created) return true;

  const [orderResult, itemsResult] = await Promise.all([
    orderRepository.findOrderById(db, completion.order.id),
    orderRepository.findOrderItems(db, completion.order.id),
  ]);
  if (orderResult.error || !orderResult.data || itemsResult.error) {
    console.error("[stripe] completed order could not be loaded", {
      orderError: orderResult.error,
      itemsError: itemsResult.error,
      orderId: completion.order.id,
    });
    throw new UnavailableError(
      "checkout_completion_failed",
      "Die bezahlte Bestellung konnte nicht geladen werden.",
    );
  }

  const order = orderResult.data;
  const fulfillment = order.fulfillment_type === "pickup" ? "pickup" : "delivery";
  const addressLine = [
    order.address_line1,
    order.address_line2 && !/^https?:\/\//i.test(order.address_line2)
      ? order.address_line2
      : null,
    [order.postal_code, order.city].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  await notifyOrderCreated({
    orderId: order.id,
    orderNumber: order.order_number,
    confirmationToken: order.confirmation_token,
    status: order.status,
    fulfillment,
    paymentMethod: "card",
    total: money(order.total),
    locale: order.locale === "en" ? "en" : "de",
    customerName: order.customer_name || "Gast",
    customerEmail: order.customer_email || "",
    customerPhone: order.customer_phone || "",
    notes: order.customer_notes,
    addressLine: addressLine || null,
    items: itemsResult.data.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: money(item.unit_price),
    })),
    db,
    paidOnline: true,
  });

  return true;
}

/**
 * Backup when the webhook is slow: confirm PaymentIntent or legacy Checkout
 * Session and fulfill the order.
 */
export async function syncStripeCheckoutSession(input: {
  confirmationToken: string;
  sessionId?: string;
  paymentIntentId?: string;
}): Promise<void> {
  if (!isStripeConfigured() || !isUuid(input.confirmationToken)) return;

  try {
    if (input.paymentIntentId && /^pi_[a-zA-Z0-9_]+$/.test(input.paymentIntentId)) {
      const intent = await retrievePaymentIntent(input.paymentIntentId);
      if (intent.status !== "succeeded") return;
      const metaToken = intent.metadata?.confirmation_token;
      const draftId = intent.metadata?.checkout_draft_id;
      if (draftId && metaToken === input.confirmationToken) {
        await completeStripeCheckoutDraftFromStripe({
          draftId,
          confirmationToken: metaToken,
          paymentReference: intent.id,
          amountReceived: intent.amount_received,
          currency: intent.currency,
        });
        return;
      }
      const orderId = intent.metadata?.order_id;
      if (!orderId || metaToken !== input.confirmationToken) return;
      await markOrderPaidFromStripe({
        orderId,
        paymentReference: intent.id,
      });
      return;
    }

    if (input.sessionId && /^cs_[a-zA-Z0-9_]+$/.test(input.sessionId)) {
      const session = await retrieveCheckoutSession(input.sessionId);
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return;
      }
      const metaToken = session.metadata?.confirmation_token;
      const orderId = session.metadata?.order_id;
      if (!orderId || metaToken !== input.confirmationToken) return;
      await markOrderPaidFromStripe({
        orderId,
        paymentReference: session.id,
      });
    }
  } catch (error) {
    console.error("[stripe] payment sync failed", error);
  }
}

/** Only one sweep per this many ms per server instance. */
const AUTO_COMPLETE_THROTTLE_MS = 20_000;
let lastAutoCompleteAt = 0;

/**
 * Closes orders whose promised waiting time has passed (60 min delivery/pickup).
 * There is no scheduler: every admin or status read triggers a sweep,
 * throttled so the 4s confirmation-page poll cannot hammer the database.
 *
 * Failures are swallowed on purpose — a sweep is never worth breaking a page
 * render or a status poll over, and the next read retries.
 */
export async function completeDueOrders(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastAutoCompleteAt < AUTO_COMPLETE_THROTTLE_MS) return 0;
  lastAutoCompleteAt = now;

  let closed = 0;
  try {
    const db = trustedClient();

    for (const fulfillment of ["delivery", "pickup"] as const) {
      const cutoff = autoCompleteCutoff(fulfillment, new Date(now)).toISOString();
      const due = await orderRepository.findOrdersDueForCompletion(
        db,
        fulfillment,
        cutoff,
        OPEN_ORDER_STATUSES,
      );
      const rows = due.data ?? [];
      if (!rows.length) continue;

      const statusById = new Map(rows.map((row) => [row.id, row.status]));
      const updated = await orderRepository.completeOrders(
        db,
        rows.map((row) => row.id),
        OPEN_ORDER_STATUSES,
      );

      for (const row of updated.data ?? []) {
        const from = statusById.get(row.id);
        await orderRepository.insertStatusEvent(db, {
          orderId: row.id,
          from: isOrderStatus(from) ? from : null,
          to: "completed",
          changedBy: null,
          note: "Automatisch abgeschlossen",
        });
        closed += 1;
      }
    }
  } catch (error) {
    console.error("[orders] auto-complete sweep failed", error);
  }

  return closed;
}

/**
 * Guest-facing order lookup. The confirmation token is the capability, so no
 * session is required, but nothing is returned for a malformed token.
 */
export async function getOrderByToken(token: string) {
  if (!isUuid(token)) return null;

  try {
    await completeDueOrders();
    const db = trustedClient();
    const orderResult = await orderRepository.findByConfirmationToken(db, token);
    if (orderResult.error || !orderResult.data) return null;

    return orderResult.data;
  } catch {
    return null;
  }
}

/**
 * The only way an order status may change. Callers cannot skip the lifecycle
 * rules, and the acting user is taken from the session rather than the request.
 */
export async function updateOrderStatus(input: {
  orderId: string;
  nextStatus: unknown;
}): Promise<{ from: OrderStatus; to: OrderStatus }> {
  const { supabase, actor } = await requireCapability("orders:transition");

  if (!isUuid(input.orderId)) {
    throw new NotFoundError("order_not_found", "Bestellung wurde nicht gefunden.");
  }

  const db = supabase as unknown as Db;
  const current = await orderRepository.findOrderStatus(db, input.orderId);
  if (current.error || !current.data || !isOrderStatus(current.data.status)) {
    throw new NotFoundError("order_not_found", "Bestellung wurde nicht gefunden.");
  }

  const from = current.data.status;
  const to = assertTransition(from, input.nextStatus, actor.role);

  const updated = await orderRepository.updateStatus(db, input.orderId, from, to);
  if (updated.error) {
    throw new UnavailableError("status_update_failed", updated.error.message);
  }
  if (!updated.data) {
    throw new ConflictError(
      "status_changed",
      "Die Bestellung wurde zwischenzeitlich geändert. Bitte neu laden.",
    );
  }

  await orderRepository.insertStatusEvent(db, {
    orderId: input.orderId,
    from,
    to,
    changedBy: actor.userId,
  });

  void notifyStatusEmail(db, input.orderId, to).catch((error) => {
    console.error("[email] status change failed", error);
  });

  return { from, to };
}

async function notifyStatusEmail(
  db: Db,
  orderId: string,
  status: OrderStatus,
) {
  const orderResult = await orderRepository.findOrderById(db, orderId);
  const order = orderResult.data;
  if (!order?.customer_email || !order.confirmation_token) return;

  await sendOrderStatusEmail({
    to: order.customer_email,
    customerName: order.customer_name || "Gast",
    orderNumber: order.order_number,
    confirmationToken: order.confirmation_token,
    fulfillmentType:
      order.fulfillment_type === "pickup" ? "pickup" : "delivery",
    total: money(order.total),
    status,
    locale: order.locale,
  });
}

export type AdminOrderListResult = Awaited<
  ReturnType<typeof orderRepository.listOrders>
>;

export async function listOrdersForBackOffice(query: {
  status?: string;
  search?: string;
  page: number;
  pageSize: number;
}) {
  const { supabase } = await requireCapability("orders:read");
  await completeDueOrders();
  const db = supabase as unknown as Db;
  const from = Math.max(0, (query.page - 1) * query.pageSize);

  const result = await orderRepository.listOrders(db, {
    status: isOrderStatus(query.status) ? query.status : undefined,
    search: query.search,
    from,
    to: from + query.pageSize - 1,
  });

  const orderIds = (result.data ?? []).map((order) => order.id);
  const printResult = orderIds.length
    ? await printJobRepository.findLatestPrintJobsForOrders(db, orderIds)
    : { data: [], error: null };

  const latestPrint = new Map<string, PrintJob>();
  for (const job of printResult.data ?? []) {
    if (!latestPrint.has(job.order_id)) latestPrint.set(job.order_id, job);
  }

  return {
    ...result,
    printJobsByOrderId: latestPrint,
  };
}

export async function getOrderForBackOffice(orderId: string) {
  const { supabase, actor } = await requireCapability("orders:read");
  if (!isUuid(orderId)) {
    return {
      order: null,
      items: [],
      transitions: [],
      printJob: null,
      error: null as string | null,
    };
  }

  await completeDueOrders();
  const db = supabase as unknown as Db;
  const [orderResult, itemsResult, printResult] = await Promise.all([
    orderRepository.findOrderById(db, orderId),
    orderRepository.findOrderItems(db, orderId),
    printJobRepository.findLatestPrintJobForOrder(db, orderId),
  ]);

  const status = orderResult.data?.status;

  return {
    order: orderResult.data ?? null,
    items: itemsResult.data ?? [],
    printJob: printResult.data ?? null,
    // Staff only ever cancel: the kitchen statuses are gone from the UI and
    // orders close themselves once the promised waiting time has passed.
    transitions: isOrderStatus(status)
      ? allowedTransitionsFor(actor.role as AppRole, status).filter(
          (next) => next === "cancelled",
        )
      : [],
    error:
      orderResult.error?.message ??
      itemsResult.error?.message ??
      printResult.error?.message ??
      null,
  };
}

/** Today's calendar date in the restaurant timezone, as `YYYY-MM-DD`. */
export function restaurantDateKey(now = new Date()): string {
  const dateParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: RESTAURANT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

/**
 * Midnight of a Zurich calendar date, as a UTC ISO string. KPI cards must
 * follow Zurich calendar days, not the server's.
 */
function startOfRestaurantDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);

  // Midday UTC on that calendar date, then read Zurich's wall clock to learn
  // the current offset (CET +1 / CEST +2) without a timezone library.
  const probe = new Date(`${dateStr}T12:00:00.000Z`);
  const zurichHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: RESTAURANT_TIMEZONE,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(probe),
  );
  const offsetHours = zurichHour - 12;

  return new Date(
    Date.UTC(year, month - 1, day, -offsetHours, 0, 0, 0),
  ).toISOString();
}

/** The day after `dateStr`, so a range can be queried as `[since, until)`. */
function nextRestaurantDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10);
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function dateKeyOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_KEY.test(value)) return null;
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

export type OverviewRange = {
  /** Inclusive Zurich calendar dates, `YYYY-MM-DD`. */
  from: string;
  to: string;
};

/**
 * Turns whatever the dashboard URL carries into a sane inclusive day range.
 * Missing or malformed values fall back to today, and a reversed range is
 * swapped rather than returning nothing.
 */
export function resolveOverviewRange(input: {
  from?: unknown;
  to?: unknown;
}): OverviewRange {
  const today = restaurantDateKey();
  const from = dateKeyOrNull(input.from);
  const to = dateKeyOrNull(input.to);

  if (!from && !to) return { from: today, to: today };

  const start = from ?? to ?? today;
  const end = to ?? from ?? today;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

export type OverviewKpis = {
  /**
   * Counted sales in the range: cash COD + paid Stripe.
   * Unpaid abandoned Checkout sessions are excluded.
   */
  transactions: number;
  /** cashRevenue + onlineRevenue. */
  totalRevenue: number;
  /** Paid online (Stripe card / TWINT) totals, non-cancelled. */
  onlineRevenue: number;
  onlineCount: number;
  /** Cash / COD totals, non-cancelled. */
  cashRevenue: number;
  cashCount: number;
  pending: number;
  confirmed: number;
  preparing: number;
  ready: number;
  outForDelivery: number;
  completed: number;
  cancelled: number;
  /** Orders still in the kitchen / handoff pipeline. */
  inProgress: number;
};

export async function getLatestOrderForAlert() {
  const { supabase } = await requireCapability("orders:read");
  const db = supabase as unknown as Db;
  const { data, error } = await orderRepository.findLatestOrderId(db);
  if (error) throw new UnavailableError("orders_read_failed", error.message);
  return data
    ? { id: data.id, createdAt: data.created_at, orderNumber: data.order_number }
    : null;
}

export async function getBackOfficeOverview(range?: OverviewRange) {
  const { supabase } = await requireCapability("orders:read");
  await completeDueOrders();
  const db = supabase as unknown as Db;
  const { from, to } = range ?? resolveOverviewRange({});
  const since = startOfRestaurantDate(from);
  const until = startOfRestaurantDate(nextRestaurantDate(to));

  const [availability, recent, rangeRows] = await Promise.all([
    settingsRepository.findAcceptsOrders(db),
    orderRepository.listRecentOrders(db, 6, { since, until }),
    orderRepository.listOrderKpisSince(db, since, until),
  ]);

  const rows = rangeRows.data ?? [];
  const byStatus = {
    pending: 0,
    confirmed: 0,
    preparing: 0,
    ready: 0,
    out_for_delivery: 0,
    completed: 0,
    cancelled: 0,
  };
  let cashRevenue = 0;
  let cashCount = 0;
  let onlineRevenue = 0;
  let onlineCount = 0;

  for (const row of rows) {
    const status = row.status as keyof typeof byStatus;
    if (status in byStatus) byStatus[status] += 1;
    if (status === "cancelled") continue;

    const total = Number(row.total ?? 0);
    const method = String(row.payment_method ?? "cash");
    const paymentStatus = String(row.payment_status ?? "pending");

    if (method === "cash") {
      cashCount += 1;
      cashRevenue = money(cashRevenue + total);
      continue;
    }

    // Stripe / card / TWINT — only count once payment succeeded.
    if (paymentStatus === "paid") {
      onlineCount += 1;
      onlineRevenue = money(onlineRevenue + total);
    }
  }

  const transactions = cashCount + onlineCount;
  const totalRevenue = money(cashRevenue + onlineRevenue);

  const kpis: OverviewKpis = {
    transactions,
    totalRevenue,
    onlineRevenue,
    onlineCount,
    cashRevenue,
    cashCount,
    pending: byStatus.pending,
    confirmed: byStatus.confirmed,
    preparing: byStatus.preparing,
    ready: byStatus.ready,
    outForDelivery: byStatus.out_for_delivery,
    completed: byStatus.completed,
    cancelled: byStatus.cancelled,
    inProgress:
      byStatus.pending +
      byStatus.confirmed +
      byStatus.preparing +
      byStatus.ready +
      byStatus.out_for_delivery,
  };

  return {
    acceptsOrders: availability.data?.accepts_orders ?? true,
    orders: recent.data ?? [],
    kpis,
    range: { from, to },
    error:
      availability.error?.message ??
      recent.error?.message ??
      rangeRows.error?.message ??
      null,
  };
}
