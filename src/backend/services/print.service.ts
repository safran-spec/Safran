import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCapability } from "@/backend/auth/authorize";
import {
  NotFoundError,
  UnavailableError,
} from "@/backend/errors";
import {
  buildBillPdf,
  receiptPayloadFromJson,
  type ReceiptPayload,
} from "@/backend/printing/bill-pdf";
import { sendPdfToPrinter } from "@/backend/printing/printer-adapter";
import * as orderRepository from "@/backend/repositories/order.repository";
import * as printJobRepository from "@/backend/repositories/print-job.repository";
import * as settingsRepository from "@/backend/repositories/settings.repository";
import { createServiceClient } from "@/backend/supabase/clients";
import { isUuid } from "@/backend/validation/primitives";
import type {
  Database,
  Order,
  OrderItem,
  PrintJob,
  PrintTriggerSource,
} from "@/types/database";

type Db = SupabaseClient<Database>;

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_BASE_MS = 15_000;

function trustedClient(): Db {
  return createServiceClient() as unknown as Db;
}

function backoffMs(attempt: number) {
  return RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1);
}

/** Printed bills are English; keep Swiss local time for the kitchen. */
function formatCreatedAt(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Zurich",
  }).format(new Date(iso));
}

function addressLine(order: Order) {
  const flat = [
    order.address_line1,
    order.address_line2,
    [order.postal_code, order.city].filter(Boolean).join(" "),
  ].filter(Boolean);

  if (flat.length) return flat.join(", ");

  const raw = order.delivery_address;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const row = raw as Record<string, unknown>;
    const parts = [
      row.street && row.houseNumber
        ? `${row.street} ${row.houseNumber}`
        : row.street ?? row.address_line1 ?? row.line1,
      row.address_line2 ?? row.line2,
      [row.postalCode ?? row.postal_code, row.city].filter(Boolean).join(" "),
    ]
      .map((part) => (typeof part === "string" ? part.trim() : ""))
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
    const values = Object.values(row).filter(
      (value): value is string => typeof value === "string" && value.trim().length > 0,
    );
    if (values.length) return values.join(", ");
  }

  return null;
}

export function buildReceiptPayload(
  order: Order,
  items: OrderItem[],
  restaurantName: string,
): ReceiptPayload {
  return {
    restaurantName: restaurantName || "Safran",
    orderNumber: order.order_number,
    createdAt: formatCreatedAt(order.created_at),
    fulfillmentType: order.fulfillment_type,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    customerEmail: order.customer_email,
    customerNotes: order.customer_notes ?? order.customer_note,
    address: addressLine(order),
    addressLine1: order.address_line1,
    addressLine2: order.address_line2,
    postalCode: order.postal_code,
    city: order.city,
    items: items.map((item) => ({
      name: item.name || item.item_name,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      lineTotal: Number(item.line_total),
      notes: item.notes,
    })),
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total),
    currency: order.currency || "CHF",
    paymentMethod: order.payment_method || "cash",
    paymentStatus: order.payment_status ?? "pending",
  };
}

async function loadReceiptContext(db: Db, orderId: string) {
  const [orderResult, itemsResult, siteSettings] = await Promise.all([
    orderRepository.findOrderById(db, orderId),
    orderRepository.findOrderItems(db, orderId),
    settingsRepository.findSiteSettings(db),
  ]);

  if (orderResult.error || !orderResult.data) {
    throw new NotFoundError("order_not_found", "Bestellung wurde nicht gefunden.");
  }

  const nameRow = (siteSettings.data ?? []).find(
    (row) => row.key === "restaurant_name",
  );
  const restaurantName =
    typeof nameRow?.value === "string" && nameRow.value.trim()
      ? nameRow.value.trim()
      : "Safran";

  return {
    order: orderResult.data,
    items: itemsResult.data ?? [],
    restaurantName,
  };
}

/**
 * Persist a print job first, then kick the queue. Order creation must not fail
 * if the printer is offline — the row stays pending for retries.
 */
export async function enqueueOrderPrintJob(input: {
  orderId: string;
  triggerSource?: PrintTriggerSource;
  db?: Db;
}): Promise<PrintJob | null> {
  const db = input.db ?? trustedClient();
  if (!isUuid(input.orderId)) return null;

  try {
    const { order, items, restaurantName } = await loadReceiptContext(
      db,
      input.orderId,
    );
    const payload = buildReceiptPayload(order, items, restaurantName);
    const inserted = await printJobRepository.insertPrintJob(db, {
      order_id: order.id,
      status: "pending",
      trigger_source: input.triggerSource ?? "order_created",
      attempts: 0,
      max_attempts: DEFAULT_MAX_ATTEMPTS,
      next_attempt_at: new Date().toISOString(),
      payload,
    });

    if (inserted.error || !inserted.data) {
      console.error("[print] failed to queue job", inserted.error?.message);
      return null;
    }

    // Fire-and-forget processing; retries continue via processPrintQueue.
    void processPrintQueue({ db, limit: 3 }).catch((error) => {
      console.error("[print] queue drain failed", error);
    });

    return inserted.data;
  } catch (error) {
    console.error("[print] enqueue failed", error);
    return null;
  }
}

/** Final A4 bill PDF for admin preview / download (same file the printer gets). */
export async function buildOrderBillPdf(orderId: string) {
  const { supabase } = await requireCapability("orders:read");
  if (!isUuid(orderId)) {
    throw new NotFoundError("order_not_found", "Bestellung wurde nicht gefunden.");
  }

  const { order, items, restaurantName } = await loadReceiptContext(
    supabase as unknown as Db,
    orderId,
  );
  const payload = buildReceiptPayload(order, items, restaurantName);
  const bytes = await buildBillPdf(payload);
  const safeNumber = order.order_number.replace(/[^\w.-]+/g, "_");
  return {
    bytes,
    filename: `safran-rechnung-${safeNumber}.pdf`,
  };
}

export async function processPrintQueue(options?: {
  db?: Db;
  limit?: number;
}): Promise<{ processed: number; printed: number; failed: number }> {
  const db = options?.db ?? trustedClient();
  const limit = Math.max(1, Math.min(options?.limit ?? 10, 25));
  let processed = 0;
  let printed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i += 1) {
    const job = await printJobRepository.claimNextPrintJob(db);
    if (!job) break;
    processed += 1;

    const payload = receiptPayloadFromJson(job.payload);
    if (!payload) {
      await printJobRepository.markPrintJobFailed(
        db,
        job.id,
        "Invalid receipt payload",
        null,
        true,
      );
      failed += 1;
      continue;
    }

    let pdfBytes: Uint8Array;
    try {
      pdfBytes = await buildBillPdf(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "PDF bill could not be built";
      console.error("[print] PDF build failed", message);
      await printJobRepository.markPrintJobFailed(
        db,
        job.id,
        message.slice(0, 500),
        null,
        true,
      );
      failed += 1;
      continue;
    }

    const result = await sendPdfToPrinter({
      pdfBytes,
      title: `Safran #${payload.orderNumber}`,
    });
    console.info(
      `[print] job=${job.id} order=#${payload.orderNumber} ok=${result.ok}${
        result.ok ? "" : ` error=${result.error}`
      }`,
    );

    if (result.ok) {
      await printJobRepository.markPrintJobPrinted(db, job.id);
      printed += 1;
      continue;
    }

    const exhausted = job.attempts >= job.max_attempts;
    const nextAttemptAt = exhausted
      ? null
      : new Date(Date.now() + backoffMs(job.attempts)).toISOString();

    await printJobRepository.markPrintJobFailed(
      db,
      job.id,
      result.error,
      nextAttemptAt,
      exhausted,
    );
    failed += 1;
  }

  return { processed, printed, failed };
}

/** Staff-triggered reprint from the dashboard. */
export async function reprintOrderBill(orderId: string) {
  const { supabase } = await requireCapability("orders:transition");
  if (!isUuid(orderId)) {
    throw new NotFoundError("order_not_found", "Bestellung wurde nicht gefunden.");
  }

  const db = supabase as unknown as Db;
  const job = await enqueueOrderPrintJob({
    orderId,
    triggerSource: "manual_reprint",
    db,
  });

  if (!job) {
    throw new UnavailableError(
      "print_enqueue_failed",
      "Der Druckauftrag konnte nicht erstellt werden.",
    );
  }

  // Process this job immediately so staff get quick feedback.
  await processPrintQueue({ db, limit: 5 });

  const latest = await printJobRepository.findLatestPrintJobForOrder(db, orderId);
  return latest.data;
}

export async function getLatestPrintJobForOrder(orderId: string) {
  const { supabase } = await requireCapability("orders:read");
  if (!isUuid(orderId)) return null;
  const result = await printJobRepository.findLatestPrintJobForOrder(
    supabase as unknown as Db,
    orderId,
  );
  return result.data ?? null;
}

export async function getLatestPrintJobsByOrderIds(orderIds: string[]) {
  const { supabase } = await requireCapability("orders:read");
  const result = await printJobRepository.findLatestPrintJobsForOrders(
    supabase as unknown as Db,
    orderIds,
  );

  const latest = new Map<string, PrintJob>();
  for (const job of result.data ?? []) {
    if (!latest.has(job.order_id)) latest.set(job.order_id, job);
  }
  return latest;
}

export const printJobStatusLabels: Record<string, string> = {
  pending: "Warteschlange",
  printing: "Druckt…",
  printed: "Gedruckt",
  failed: "Fehlgeschlagen",
  cancelled: "Abgebrochen",
};
