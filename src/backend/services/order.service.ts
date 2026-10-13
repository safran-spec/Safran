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
import { enqueueOrderPrintJob } from "@/backend/services/print.service";
import {
  sendOrderNotifyEmail,
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
} from "@/backend/services/email.service";
import { createServiceClient } from "@/backend/supabase/clients";
import type { CreatedOrder, OrderRequest } from "@/backend/types";
import { assertDeliverableEmail } from "@/backend/validation/email";
import { menuItemNumber } from "@/backend/validation/order";
import { isUuid } from "@/backend/validation/primitives";
import type { Database, OrderStatus, PrintJob } from "@/types/database";

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
 * Creates a cash order.
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

  await assertDeliverableEmail(request.customer.email);

  const duplicate = await orderRepository.findByIdempotencyKey(
    db,
    request.idempotencyKey,
  );
  if (duplicate.data) {
    return {
      orderNumber: String(duplicate.data.order_number),
      confirmationToken: String(duplicate.data.confirmation_token),
      total: money(duplicate.data.total),
      currency: "CHF",
      status: String(duplicate.data.status || INITIAL_ORDER_STATUS),
    };
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

  const rules: PricingRules = {
    deliveryFee: Number(settings.delivery_fee ?? 0),
    deliveryMinimum: Number(settings.minimum_order ?? 0),
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
    payment_method: "cash",
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

  const result = await orderRepository.insertOrder(
    db,
    orderRow,
    lines.map((line) => ({
      menu_item_id: Number(line.menuItemId),
      name: line.name,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      line_total: lineTotal(line),
      notes: null,
    })),
  );

  if (!result.order) {
    throw new UnavailableError(
      "order_failed",
      "Die Bestellung konnte nicht gespeichert werden.",
    );
  }

  // Bill print: save a print_jobs row first, then trigger the printer. Failures
  // stay queued for retry and never block checkout.
  if (result.order.id) {
    void enqueueOrderPrintJob({
      orderId: result.order.id,
      triggerSource: "order_created",
      db,
    });
  }

  void sendOrderPlacedEmail({
    to: request.customer.email,
    customerName: `${request.customer.firstName} ${request.customer.lastName}`,
    orderNumber: result.order.order_number,
    confirmationToken: result.order.confirmation_token,
    fulfillmentType: request.fulfillment,
    total: money(result.order.total),
    status: result.order.status,
    locale: request.locale,
  }).catch((error) => {
    console.error("[email] order placed failed", error);
  });

  const addressLine = request.address
    ? [
        `${request.address.street} ${request.address.houseNumber}`,
        `${request.address.postalCode} ${request.address.city}`,
      ]
        .filter(Boolean)
        .join(", ")
    : null;

  void sendOrderNotifyEmail({
    orderNumber: result.order.order_number,
    orderId: result.order.id,
    customerName: `${request.customer.firstName} ${request.customer.lastName}`,
    customerEmail: request.customer.email,
    customerPhone: request.customer.phone,
    fulfillmentType: request.fulfillment,
    total: money(result.order.total),
    notes: request.notes ?? null,
    addressLine,
    items: lines.map((line) => ({
      name: line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
    })),
  }).catch((error) => {
    console.error("[email] kitchen notify failed", error);
  });

  return {
    orderNumber: result.order.order_number,
    confirmationToken: result.order.confirmation_token,
    total: money(result.order.total),
    currency: "CHF",
    status: result.order.status,
  };
}

/** Only one sweep per this many ms per server instance. */
const AUTO_COMPLETE_THROTTLE_MS = 20_000;
let lastAutoCompleteAt = 0;

/**
 * Closes orders whose promised waiting time has passed (45 min delivery, 30 min
 * pickup). There is no scheduler: every admin or status read triggers a sweep,
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
  /** Non-cancelled orders placed in the selected range. */
  transactions: number;
  /** Online / card / TWINT totals (non-cash, non-cancelled). */
  onlineRevenue: number;
  onlineCount: number;
  /** Cash totals (non-cancelled). */
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
  let transactions = 0;
  let cashRevenue = 0;
  let cashCount = 0;
  let onlineRevenue = 0;
  let onlineCount = 0;

  for (const row of rows) {
    const status = row.status as keyof typeof byStatus;
    if (status in byStatus) byStatus[status] += 1;
    if (status === "cancelled") continue;

    transactions += 1;
    const total = Number(row.total ?? 0);
    if (row.payment_method === "cash") {
      cashCount += 1;
      cashRevenue = money(cashRevenue + total);
    } else {
      // Everything that is not cash is treated as an online payment
      // (card, TWINT, provider, …) so this KPI stays correct when
      // online checkout is enabled later.
      onlineCount += 1;
      onlineRevenue = money(onlineRevenue + total);
    }
  }

  const kpis: OverviewKpis = {
    transactions,
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
