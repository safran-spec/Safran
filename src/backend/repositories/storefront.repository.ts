import "server-only";

import { cache } from "react";
import { CACHE_SECONDS, CACHE_TAGS } from "@/backend/cache/tags";
import { readRows, type Row } from "@/backend/supabase/rest";

export type { Row };

/**
 * Public storefront reads. Every table below is readable by `anon` under RLS
 * (active menu rows, public settings, published content, opening hours, store
 * availability), so the cacheable REST path is safe here.
 */
const CATEGORY_QUERY =
  "select=id,title,subtitle,sort_order,is_active,image_path,note_de,note_en&is_active=eq.true&order=sort_order";
const ITEM_QUERY =
  "select=id,category_id,item_number,name,description_de,description_en,price,discount_percent,is_active,sort_order,image_path&is_active=eq.true&order=sort_order";
/** Homepage tiles + gallery — no descriptions/prices needed. */
const ITEM_PREVIEW_QUERY =
  "select=id,category_id,item_number,name,is_active,sort_order,image_path&is_active=eq.true&order=sort_order";

export const readCategories = cache(() =>
  readRows("menu_categories", CATEGORY_QUERY, [CACHE_TAGS.menu], CACHE_SECONDS.menu),
);

export const readItems = cache(() =>
  readRows("menu_items", ITEM_QUERY, [CACHE_TAGS.menu], CACHE_SECONDS.menu),
);

export const readItemPreviews = cache(() =>
  readRows(
    "menu_items",
    ITEM_PREVIEW_QUERY,
    [CACHE_TAGS.menu],
    CACHE_SECONDS.menu,
  ),
);

export const readSiteSettings = cache(() =>
  readRows(
    "site_settings",
    "select=key,value&is_public=eq.true",
    [CACHE_TAGS.chrome],
    CACHE_SECONDS.chrome,
  ),
);

export const readContentBlocks = cache(() =>
  readRows(
    "content_blocks",
    "select=key,body,title&is_published=eq.true",
    [CACHE_TAGS.chrome],
    CACHE_SECONDS.chrome,
  ),
);

export const readOpeningHours = cache(() =>
  readRows(
    "opening_hours",
    "select=weekday,is_closed,lunch_opens,lunch_closes,dinner_opens,dinner_closes",
    [CACHE_TAGS.chrome],
    CACHE_SECONDS.chrome,
  ),
);

export const readStoreAvailability = cache(() =>
  readRows(
    "store_availability",
    "select=accepts_orders,paused_reason&id=eq.true",
    [CACHE_TAGS.status],
    CACHE_SECONDS.status,
  ),
);

export const readDeliveryZoneMinimums = cache(() =>
  readRows(
    "delivery_zone_minimums",
    "select=postal_code,minimum_order&is_active=eq.true&order=postal_code",
    [CACHE_TAGS.deliveryZones],
    CACHE_SECONDS.deliveryZones,
  ),
);
