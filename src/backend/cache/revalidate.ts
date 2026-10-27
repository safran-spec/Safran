import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { CACHE_TAGS } from "@/backend/cache/tags";

/**
 * Cache invalidation for the storefront. `updateTag` expires the tagged data
 * immediately so the admin sees their own write, and `revalidatePath` refreshes
 * the rendered routes.
 *
 * These may only be called from Server Actions (`updateTag` requirement).
 */
export function refreshStoreStatus() {
  updateTag(CACHE_TAGS.status);
  revalidatePath("/", "layout");
  revalidatePath("/kasse");
  revalidatePath("/admin", "layout");
}

export function refreshMenu() {
  updateTag(CACHE_TAGS.menu);
  revalidatePath("/", "layout");
  revalidatePath("/speisekarte");
  revalidatePath("/admin/menu");
}

export function refreshSettings() {
  updateTag(CACHE_TAGS.chrome);
  updateTag(CACHE_TAGS.status);
  revalidatePath("/", "layout");
  revalidatePath("/kasse");
  revalidatePath("/speisekarte");
  revalidatePath("/admin/settings");
  revalidatePath("/admin", "layout");
}

export function refreshDeliveryZones() {
  updateTag(CACHE_TAGS.deliveryZones);
  updateTag(CACHE_TAGS.chrome);
  revalidatePath("/kasse");
  revalidatePath("/admin/delivery-zones");
}
