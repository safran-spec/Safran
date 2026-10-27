import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCapability } from "@/backend/auth/authorize";
import {
  normalizePostalCode,
  resolveDeliveryMinimum,
} from "@/backend/domain/order-pricing";
import { ConflictError, UnavailableError } from "@/backend/errors";
import * as deliveryZoneRepository from "@/backend/repositories/delivery-zone.repository";
import {
  parseDeliveryZoneId,
  parseDeliveryZoneInput,
} from "@/backend/validation/delivery-zone";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

async function adminContext() {
  const { supabase } = await requireCapability("settings:manage");
  return supabase as unknown as Db;
}

function assertOk(
  error: { message: string } | null,
  code: string,
): void {
  if (!error) return;
  const message = error.message || "";
  if (/duplicate key|unique constraint/i.test(message)) {
    throw new ConflictError(
      "postal_code_taken",
      "Für diese PLZ existiert bereits eine Regel.",
    );
  }
  throw new UnavailableError(code, message);
}

export async function listDeliveryZones() {
  const db = await adminContext();
  const { data, error } = await deliveryZoneRepository.listDeliveryZones(db);
  return {
    zones: data ?? [],
    error: error?.message ?? null,
  };
}

export async function createDeliveryZone(input: Record<string, unknown>) {
  const db = await adminContext();
  const parsed = parseDeliveryZoneInput(input);
  const { error } = await deliveryZoneRepository.insertDeliveryZone(db, parsed);
  assertOk(error, "zone_create_failed");
}

export async function updateDeliveryZone(input: Record<string, unknown>) {
  const db = await adminContext();
  const id = parseDeliveryZoneId(input.id);
  const parsed = parseDeliveryZoneInput(input);
  const { error } = await deliveryZoneRepository.updateDeliveryZone(
    db,
    id,
    parsed,
  );
  assertOk(error, "zone_update_failed");
}

export async function deleteDeliveryZone(input: Record<string, unknown>) {
  const db = await adminContext();
  const id = parseDeliveryZoneId(input.id);
  const { error } = await deliveryZoneRepository.deleteDeliveryZone(db, id);
  assertOk(error, "zone_delete_failed");
}

/**
 * Resolves the delivery minimum for an order. Used by order placement with the
 * service-role client (bypasses RLS). Falls back to the global setting.
 */
export async function resolveOrderDeliveryMinimum(
  db: Db,
  postalCode: string | null | undefined,
  fallback: number,
): Promise<number> {
  const code = normalizePostalCode(postalCode);
  if (!code) return resolveDeliveryMinimum(null, [], fallback);

  const { data, error } =
    await deliveryZoneRepository.findActiveDeliveryZoneByPostal(db, code);
  if (error) {
    // Prefer taking the global minimum over blocking checkout (e.g. migration
    // not applied yet). Admins still see errors when managing the table.
    console.error("[delivery-zones] lookup failed", error.message);
    return resolveDeliveryMinimum(null, [], fallback);
  }

  if (!data) return resolveDeliveryMinimum(null, [], fallback);
  return resolveDeliveryMinimum(
    code,
    [{ postalCode: data.postal_code, minimumOrder: Number(data.minimum_order) }],
    fallback,
  );
}
