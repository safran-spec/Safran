import { ValidationError } from "@/backend/errors";
import { boolean, nonNegativeNumber, text } from "@/backend/validation/primitives";
import { normalizePostalCode } from "@/backend/domain/order-pricing";

export type DeliveryZoneInput = {
  postalCode: string;
  minimumOrder: number;
  isActive: boolean;
};

const SWISS_PLZ = /^[0-9]{4}$/;

export function parseDeliveryZoneId(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError(
      "zone_id_invalid",
      "Die PLZ-Regel wurde nicht gefunden.",
    );
  }
  return id;
}

export function parseDeliveryZoneInput(
  input: Record<string, unknown>,
): DeliveryZoneInput {
  const postalCode = normalizePostalCode(text(input.postalCode, 12));
  if (!SWISS_PLZ.test(postalCode)) {
    throw new ValidationError(
      "postal_code_invalid",
      "Bitte eine gültige Schweizer PLZ (4 Ziffern) angeben.",
    );
  }

  return {
    postalCode,
    minimumOrder: nonNegativeNumber(
      input.minimumOrder,
      "minimum_invalid",
      "Mindestbestellwerte dürfen nicht negativ sein.",
    ),
    isActive: boolean(input.isActive),
  };
}
