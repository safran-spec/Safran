import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Db = SupabaseClient<Database>;

export type DeliveryZoneRow = {
  id: number;
  postal_code: string;
  minimum_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export function listDeliveryZones(db: Db) {
  return db
    .from("delivery_zone_minimums")
    .select("id, postal_code, minimum_order, is_active, created_at, updated_at")
    .order("postal_code");
}

/** Active zones only — used at checkout / order placement. */
export function listActiveDeliveryZones(db: Db) {
  return db
    .from("delivery_zone_minimums")
    .select("postal_code, minimum_order")
    .eq("is_active", true)
    .order("postal_code");
}

export function findActiveDeliveryZoneByPostal(db: Db, postalCode: string) {
  return db
    .from("delivery_zone_minimums")
    .select("postal_code, minimum_order")
    .eq("is_active", true)
    .eq("postal_code", postalCode)
    .maybeSingle();
}

export function insertDeliveryZone(
  db: Db,
  input: { postalCode: string; minimumOrder: number; isActive: boolean },
) {
  return db
    .from("delivery_zone_minimums")
    .insert({
      postal_code: input.postalCode,
      minimum_order: input.minimumOrder,
      is_active: input.isActive,
    })
    .select("id")
    .single();
}

export function updateDeliveryZone(
  db: Db,
  id: number,
  input: { postalCode: string; minimumOrder: number; isActive: boolean },
) {
  return db
    .from("delivery_zone_minimums")
    .update({
      postal_code: input.postalCode,
      minimum_order: input.minimumOrder,
      is_active: input.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
}

export function deleteDeliveryZone(db: Db, id: number) {
  return db.from("delivery_zone_minimums").delete().eq("id", id);
}
