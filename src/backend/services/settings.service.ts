import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireCapability } from "@/backend/auth/authorize";
import { UnavailableError } from "@/backend/errors";
import {
  orderAlertSoundPublicUrl,
  validateOrderAlertAudio,
} from "@/backend/media/order-alert-audio";
import * as settingsRepository from "@/backend/repositories/settings.repository";
import { nonNegativeNumber } from "@/backend/validation/primitives";
import { parseOpeningHours, parseRestaurantSettings } from "@/backend/validation/settings";
import type { Database, Json } from "@/types/database";

type Db = SupabaseClient<Database>;

/** Stable key — storefront translates this; do not store localized copy. */
const CLOSED_REASON = "manual_closed";

/** Unset settings are stored as an empty string (see `settingValue`). */
function jsonString(value: Json | undefined): string | null {
  if (typeof value === "string") return value.trim() ? value : null;
  if (value == null) return null;
  return String(value);
}

function jsonBool(value: Json | undefined, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

async function settingsContext() {
  const { supabase } = await requireCapability("settings:manage");
  return supabase as unknown as Db;
}

/**
 * Manual open/close switch. Closing sets `accepts_orders = false`, which the
 * storefront banner, the checkout page and `createCashOrder` all read, so the
 * shop closes everywhere at once. Opening returns the shop to its regular
 * opening hours rather than forcing it open.
 */
export async function setStoreOpen(isOpen: boolean): Promise<void> {
  const db = await settingsContext();
  const { error } = await settingsRepository.setAcceptsOrders(
    db,
    isOpen,
    isOpen ? null : CLOSED_REASON,
  );
  if (error) throw new UnavailableError("store_toggle_failed", error.message);
}

/** Cached per request so layout + pages don’t double-hit store availability. */
export const getStoreOpen = cache(async (): Promise<boolean> => {
  const { supabase } = await requireCapability("orders:read");
  const { data } = await settingsRepository.findAcceptsOrders(
    supabase as unknown as Db,
  );
  return data?.accepts_orders ?? true;
});

export async function getRestaurantSettings() {
  const { supabase } = await requireCapability("settings:manage");
  const db = supabase as unknown as Db;

  const [settings, availability, hours, alerts] = await Promise.all([
    settingsRepository.findSiteSettings(db),
    settingsRepository.findAvailability(db),
    settingsRepository.findOpeningHours(db),
    settingsRepository.findOrderAlertSettings(db),
  ]);

  const alertMap = Object.fromEntries(
    (alerts.data ?? []).map((row) => [row.key, row.value]),
  );

  return {
    settings: Object.fromEntries(
      (settings.data ?? []).map((row) => [row.key, row.value]),
    ),
    availability: availability.data ?? null,
    hours: hours.data ?? [],
    orderAlert: {
      enabled: jsonBool(alertMap.order_alert_enabled, true),
      soundPath: jsonString(alertMap.order_alert_sound_path),
      soundUrl: orderAlertSoundPublicUrl(
        jsonString(alertMap.order_alert_sound_path),
      ),
    },
    error:
      settings.error?.message ??
      availability.error?.message ??
      hours.error?.message ??
      alerts.error?.message ??
      null,
  };
}

/** Readable by kitchen staff — used by the admin alert poller. */
export async function getOrderAlertConfig() {
  const { supabase } = await requireCapability("orders:read");
  const db = supabase as unknown as Db;
  const { data, error } = await settingsRepository.findOrderAlertSettings(db);
  if (error) throw new UnavailableError("order_alert_read_failed", error.message);

  const map = Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
  const soundPath = jsonString(map.order_alert_sound_path);
  return {
    enabled: jsonBool(map.order_alert_enabled, true),
    soundPath,
    soundUrl: orderAlertSoundPublicUrl(soundPath),
  };
}

export async function setOrderAlertEnabled(enabled: boolean) {
  const db = await settingsContext();
  const current = await settingsRepository.findOrderAlertSettings(db);
  const map = Object.fromEntries(
    (current.data ?? []).map((row) => [row.key, row.value]),
  );
  const { error } = await settingsRepository.upsertOrderAlertSettings(db, {
    enabled,
    soundPath: jsonString(map.order_alert_sound_path),
  });
  if (error) throw new UnavailableError("order_alert_save_failed", error.message);
}

export async function uploadOrderAlertSound(file: File) {
  const db = await settingsContext();
  const audio = await validateOrderAlertAudio(file);
  const path = `new-order.${audio.extension}`;

  const current = await settingsRepository.findOrderAlertSettings(db);
  const map = Object.fromEntries(
    (current.data ?? []).map((row) => [row.key, row.value]),
  );
  const previousPath = jsonString(map.order_alert_sound_path);

  const { error: uploadError } = await settingsRepository.uploadOrderAlertSound(
    db,
    path,
    audio.buffer,
    audio.contentType,
  );
  if (uploadError) {
    throw new UnavailableError("order_alert_upload_failed", uploadError.message);
  }

  if (previousPath && previousPath !== path) {
    await settingsRepository.removeOrderAlertSounds(db, [previousPath]);
  }

  const { error } = await settingsRepository.upsertOrderAlertSettings(db, {
    enabled: jsonBool(map.order_alert_enabled, true),
    soundPath: path,
  });
  if (error) throw new UnavailableError("order_alert_save_failed", error.message);
}

export async function clearOrderAlertSound() {
  const db = await settingsContext();
  const current = await settingsRepository.findOrderAlertSettings(db);
  const map = Object.fromEntries(
    (current.data ?? []).map((row) => [row.key, row.value]),
  );
  const previousPath = jsonString(map.order_alert_sound_path);
  if (previousPath) {
    await settingsRepository.removeOrderAlertSounds(db, [previousPath]);
  }
  const { error } = await settingsRepository.upsertOrderAlertSettings(db, {
    enabled: jsonBool(map.order_alert_enabled, true),
    soundPath: null,
  });
  if (error) throw new UnavailableError("order_alert_save_failed", error.message);
}

export async function updateRestaurantSettings(input: Record<string, unknown>) {
  const db = await settingsContext();
  const parsed = parseRestaurantSettings(input);

  const [settings, availability] = await Promise.all([
    settingsRepository.upsertSiteSettings(db, parsed),
    settingsRepository.upsertFulfillmentOptions(db, parsed),
  ]);

  const error = settings.error ?? availability.error;
  if (error) throw new UnavailableError("settings_save_failed", error.message);
}

/**
 * Global delivery minimum used when the customer's PLZ is not in the zone list.
 * Editable from both Settings and the PLZ-minimums admin page.
 */
export async function updateDefaultDeliveryMinimum(
  deliveryMinimum: unknown,
): Promise<void> {
  const db = await settingsContext();
  const value = nonNegativeNumber(
    deliveryMinimum,
    "minimum_invalid",
    "Mindestbestellwerte dürfen nicht negativ sein.",
  );
  const { error } = await settingsRepository.upsertDeliveryMinimum(db, value);
  if (error) throw new UnavailableError("settings_save_failed", error.message);
}

export async function updateOpeningHours(
  input: ReadonlyArray<Record<string, unknown>>,
) {
  const db = await settingsContext();
  const { error } = await settingsRepository.upsertOpeningHours(
    db,
    parseOpeningHours(input),
  );
  if (error) throw new UnavailableError("hours_save_failed", error.message);
}
