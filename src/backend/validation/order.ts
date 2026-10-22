import { ValidationError } from "@/backend/errors";
import { isStripeConfigured } from "@/backend/stripe/config";
import {
  integerInRange,
  isEmail,
  text,
} from "@/backend/validation/primitives";
import { isHttpUrl, isValidEmailFormat } from "@/backend/validation/email-format";
import type { OrderRequest, PaymentMethod } from "@/backend/types";

const MENU_ITEM_ID = /^menu-(\d+)$/;
const IDEMPOTENCY_KEY = /^[a-zA-Z0-9_-]{16,100}$/;

/**
 * Validates an untrusted checkout payload. Nothing price-related is read from
 * the client: only item identifiers and quantities survive.
 *
 * Shared by the web checkout route and, later, the customer app endpoint.
 */
export function parseOrderRequest(
  body: unknown,
  headerIdempotencyKey?: string | null,
): OrderRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("invalid_request", "Ungültige Bestelldaten.");
  }

  const input = body as Record<string, unknown>;
  const customer = (input.customer ?? {}) as Record<string, unknown>;
  const address = (input.address ?? {}) as Record<string, unknown>;
  const fulfillment = input.fulfillment;
  const paymentMethod = input.paymentMethod;
  const bodyKey = text(input.idempotencyKey, 100);
  const headerKey = text(headerIdempotencyKey, 100);
  const idempotencyKey = headerKey || bodyKey;

  if (headerKey && bodyKey && headerKey !== bodyKey) {
    throw new ValidationError(
      "idempotency_mismatch",
      "Die Bestellanfrage ist ungültig.",
    );
  }
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    throw new ValidationError(
      "invalid_idempotency_key",
      "Die Bestellanfrage ist ungültig.",
    );
  }
  if (fulfillment !== "delivery" && fulfillment !== "pickup") {
    throw new ValidationError("invalid_fulfillment", "Ungültige Lieferart.");
  }
  if (paymentMethod !== "cash" && paymentMethod !== "card") {
    throw new ValidationError("invalid_payment", "Ungültige Zahlungsart.");
  }
  if (paymentMethod === "card" && !isStripeConfigured()) {
    throw new ValidationError(
      "payment_unavailable",
      "Online-Zahlung ist derzeit nicht verfügbar.",
    );
  }
  if (input.acceptedNoCancellation !== true) {
    throw new ValidationError(
      "policy_required",
      "Bitte bestätigen Sie die Stornierungsbedingungen.",
    );
  }

  const parsedCustomer = {
    firstName: text(customer.firstName, 80),
    lastName: text(customer.lastName, 80),
    email: text(customer.email, 254).toLowerCase(),
    phone: text(customer.phone, 40),
  };
  if (
    !parsedCustomer.firstName ||
    !parsedCustomer.lastName ||
    !isValidEmailFormat(parsedCustomer.email) ||
    !isEmail(parsedCustomer.email) ||
    parsedCustomer.phone.length < 6
  ) {
    throw new ValidationError(
      "invalid_customer",
      "Bitte prüfen Sie Ihre Kontaktdaten.",
    );
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const quantities = new Map<string, number>();
  for (const rawItem of rawItems) {
    if (!rawItem || typeof rawItem !== "object") continue;
    const item = rawItem as Record<string, unknown>;
    const id = text(item.id, 100);
    if (!id || !MENU_ITEM_ID.test(id)) {
      throw new ValidationError(
        "invalid_items",
        "Der Warenkorb enthält ungültige Artikel.",
      );
    }
    // JSON carries real numbers, so a string quantity means a hand-built payload.
    if (typeof item.quantity !== "number") {
      throw new ValidationError(
        "invalid_items",
        "Der Warenkorb enthält ungültige Artikel.",
      );
    }
    const quantity = integerInRange(
      item.quantity,
      1,
      50,
      "invalid_items",
      "Der Warenkorb enthält ungültige Artikel.",
    );
    quantities.set(id, Math.min(50, (quantities.get(id) ?? 0) + quantity));
  }
  const items = [...quantities].map(([id, quantity]) => ({ id, quantity }));
  if (!items.length || items.length > 50) {
    throw new ValidationError("invalid_items", "Ihr Warenkorb ist leer.");
  }

  let parsedAddress: OrderRequest["address"];
  if (fulfillment === "delivery") {
    const locationUrlRaw = text(address.locationUrl, 2000);
    if (locationUrlRaw && !isHttpUrl(locationUrlRaw)) {
      throw new ValidationError(
        "invalid_location_url",
        "Bitte geben Sie einen gültigen Standort-Link ein (https://…).",
      );
    }
    parsedAddress = {
      street: text(address.street, 120),
      houseNumber: text(address.houseNumber, 20),
      postalCode: text(address.postalCode, 12),
      city: text(address.city, 80),
      locationUrl: locationUrlRaw || undefined,
    };
    if (
      !parsedAddress.street ||
      !parsedAddress.houseNumber ||
      !parsedAddress.postalCode ||
      !parsedAddress.city
    ) {
      throw new ValidationError(
        "invalid_address",
        "Bitte geben Sie eine vollständige Lieferadresse an.",
      );
    }
  }

  return {
    idempotencyKey,
    fulfillment,
    paymentMethod: paymentMethod as PaymentMethod,
    acceptedNoCancellation: true,
    customer: parsedCustomer,
    address: parsedAddress,
    notes: text(input.notes, 1000) || undefined,
    items,
    // Cosmetic only (it picks the email language), so an unknown value falls
    // back to German instead of rejecting the order.
    locale: input.locale === "en" ? "en" : "de",
  };
}

/** `menu-42` -> `42`. Assumes the id already passed `parseOrderRequest`. */
export function menuItemNumber(id: string): number {
  const match = MENU_ITEM_ID.exec(id);
  if (!match) {
    throw new ValidationError(
      "invalid_items",
      "Der Warenkorb enthält ungültige Artikel.",
    );
  }
  return Number(match[1]);
}
