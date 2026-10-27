import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { OpeningHoursInput, RestaurantSettingsInput } from "@/backend/types";
import type { Database, Json } from "@/types/database";

type Db = SupabaseClient<Database>;

export const PUBLIC_SETTING_KEYS = [
  "restaurant_name",
  "contact_email",
  "contact_phone",
  "address",
  "delivery_minimum",
  "pickup_minimum",
  "delivery_fee",
] as const;

export const ORDER_ALERT_SETTING_KEYS = [
  "order_alert_enabled",
  "order_alert_sound_path",
] as const;

export const ORDER_ALERT_BUCKET = "order-alerts";

/** Flattened checkout rules, exposed by the `store_settings` view. */
export function findStoreSettings(db: Db) {
  return db
    .from("store_settings")
    .select(
      "is_open, closed_message, pickup_enabled, delivery_enabled, minimum_order, pickup_minimum, delivery_fee",
    )
    .eq("id", "default")
    .maybeSingle();
}

export function findSiteSettings(db: Db) {
  return db
    .from("site_settings")
    .select("key, value")
    .in("key", [...PUBLIC_SETTING_KEYS]);
}

export function findOrderAlertSettings(db: Db) {
  return db
    .from("site_settings")
    .select("key, value")
    .in("key", [...ORDER_ALERT_SETTING_KEYS]);
}

/**
 * `site_settings.value` is `jsonb not null`, and the Supabase client turns a
 * JS `null` into SQL NULL — which the constraint rejects. Unset values are
 * therefore stored as an empty string; readers treat that as "not set".
 */
function settingValue(value: string | null | undefined): Json {
  return value ?? "";
}

export function upsertOrderAlertSettings(
  db: Db,
  input: { enabled: boolean; soundPath: string | null },
) {
  const rows: Array<{ key: string; value: Json; is_public: boolean }> = [
    {
      key: "order_alert_enabled",
      value: input.enabled,
      is_public: true,
    },
    {
      key: "order_alert_sound_path",
      value: settingValue(input.soundPath),
      is_public: true,
    },
  ];
  return db.from("site_settings").upsert(rows, { onConflict: "key" });
}

export function uploadOrderAlertSound(
  db: Db,
  path: string,
  body: Buffer,
  contentType: string,
) {
  return db.storage.from(ORDER_ALERT_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
  });
}

export function removeOrderAlertSounds(db: Db, paths: string[]) {
  if (!paths.length) return Promise.resolve({ data: null, error: null });
  return db.storage.from(ORDER_ALERT_BUCKET).remove(paths);
}

export function findAvailability(db: Db) {
  return db.from("store_availability").select("*").eq("id", true).maybeSingle();
}

export function findAcceptsOrders(db: Db) {
  return db
    .from("store_availability")
    .select("accepts_orders")
    .eq("id", true)
    .maybeSingle();
}

export function findOpeningHours(db: Db) {
  return db.from("opening_hours").select("*").order("weekday");
}

export function findOpeningHoursForWeekday(db: Db, weekday: number) {
  return db
    .from("opening_hours")
    .select("is_closed, lunch_opens, lunch_closes, dinner_opens, dinner_closes")
    .eq("weekday", weekday)
    .maybeSingle();
}

export function setAcceptsOrders(
  db: Db,
  acceptsOrders: boolean,
  pausedReason: string | null,
) {
  return db.from("store_availability").upsert({
    id: true,
    accepts_orders: acceptsOrders,
    paused_reason: pausedReason,
    updated_at: new Date().toISOString(),
  });
}

export function upsertSiteSettings(db: Db, input: RestaurantSettingsInput) {
  const rows: Array<{ key: string; value: Json; is_public: boolean }> = [
    { key: "restaurant_name", value: input.restaurantName, is_public: true },
    { key: "contact_email", value: settingValue(input.email), is_public: true },
    { key: "contact_phone", value: settingValue(input.phone), is_public: true },
    { key: "address", value: settingValue(input.address), is_public: true },
    { key: "delivery_minimum", value: input.deliveryMinimum, is_public: true },
    { key: "pickup_minimum", value: input.pickupMinimum, is_public: true },
    { key: "delivery_fee", value: input.deliveryFee, is_public: true },
  ];

  return db.from("site_settings").upsert(rows, { onConflict: "key" });
}

/** Fallback delivery minimum when the order PLZ has no zone rule. */
export function upsertDeliveryMinimum(db: Db, deliveryMinimum: number) {
  return db.from("site_settings").upsert(
    {
      key: "delivery_minimum",
      value: deliveryMinimum,
      is_public: true,
    },
    { onConflict: "key" },
  );
}

export function upsertFulfillmentOptions(db: Db, input: RestaurantSettingsInput) {
  return db.from("store_availability").upsert({
    id: true,
    pickup_enabled: input.pickupEnabled,
    delivery_enabled: input.deliveryEnabled,
    minimum_notice_minutes: input.minimumNoticeMinutes,
    updated_at: new Date().toISOString(),
  });
}

export function upsertOpeningHours(db: Db, input: OpeningHoursInput) {
  return db.from("opening_hours").upsert(
    input.map((day) => ({
      weekday: day.weekday,
      is_closed: day.isClosed,
      // Single daily window is stored on the lunch columns; dinner is cleared.
      lunch_opens: day.opens,
      lunch_closes: day.closes,
      dinner_opens: null,
      dinner_closes: null,
    })),
    { onConflict: "weekday" },
  );
}
