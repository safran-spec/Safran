import "server-only";

import { cache } from "react";
import { discountedPrice } from "@/backend/domain/order-pricing";
import {
  fallbackMenuItemImage,
  menuImagePublicUrl,
  resolveMenuItemImage,
} from "@/backend/media/menu-image-url";
import {
  readCategories,
  readContentBlocks,
  readDeliveryZoneMinimums,
  readItemPreviews,
  readItems,
  readOpeningHours,
  readSiteSettings,
  readStoreAvailability,
  type Row,
} from "@/backend/repositories/storefront.repository";
import { menuCategories as fallbackMenuCategories, type MenuCategory } from "@/data/menu";
import type { OpeningDay, StoreStatusConfig } from "@/lib/store-status";

export type StorefrontSettings = {
  restaurantName: string;
  description: string;
  /**
   * False when `description` is the built-in German copy. The footer then shows
   * the translated blurb instead of German text on the English site.
   */
  descriptionIsCustom: boolean;
  addressLines: string[];
  phone: string;
  phoneDisplay: string;
  email: string;
  timezone: string;
};

export type HomepageCategory = {
  name: string;
  subtitle: string;
  href: string;
  image: string;
};

export type StorefrontChrome = {
  settings: StorefrontSettings;
  hours: OpeningDay[];
  statusConfig: StoreStatusConfig;
};

export type CheckoutPricing = {
  deliveryMinimum: number;
  pickupMinimum: number;
  deliveryFee: number;
  /** Active PLZ → minimum order (CHF). */
  zoneMinimums: Record<string, number>;
};

export type StorefrontData = StorefrontChrome & {
  menuCategories: MenuCategory[];
  homepageCategories: HomepageCategory[];
};

const fallbackSettings: StorefrontSettings = {
  restaurantName: "Safran",
  description:
    "Authentische indische Küche am Romanshorner Hafen, frisch zubereitet, herzlich serviert und bequem nach Hause bestellt.",
  descriptionIsCustom: false,
  addressLines: ["Hafenstrasse 31", "8590 Romanshorn, Schweiz"],
  phone: "+41712445533",
  phoneDisplay: "032 623 59 59",
  email: "info@safran-solothurn.ch",
  timezone: "Europe/Zurich",
};

const fallbackHours: OpeningDay[] = [
  { day: 1, label: "Montag", ranges: [["11:00", "22:30"]] },
  { day: 2, label: "Dienstag", ranges: [["11:00", "22:30"]] },
  { day: 3, label: "Mittwoch", ranges: [["11:00", "22:30"]] },
  { day: 4, label: "Donnerstag", ranges: [["11:00", "22:30"]] },
  { day: 5, label: "Freitag", ranges: [["11:00", "22:30"]] },
  { day: 6, label: "Samstag", ranges: [["11:00", "22:30"]] },
  { day: 0, label: "Sonntag", ranges: [] },
];

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function boolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
    if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  }
  return fallback;
}

function keyValueMap(rows: Row[] | null): Row {
  if (!rows?.length) return {};
  if (rows.length === 1 && !text(rows[0].key) && !text(rows[0].name)) {
    return rows[0];
  }

  return Object.fromEntries(
    rows.flatMap((row) => {
      const key = text(row.key) ?? text(row.name) ?? text(row.slug);
      return key ? [[key, row.value ?? row.content ?? row.body ?? row.text]] : [];
    }),
  );
}

function normalizeSettings(settingsRows: Row[] | null, contentRows: Row[] | null) {
  const values = { ...keyValueMap(settingsRows), ...keyValueMap(contentRows) };
  const address =
    text(values.address) ??
    text(values.restaurant_address) ??
    fallbackSettings.addressLines.join("\n");
  const customDescription =
    text(values.footer_description) ??
    text(values["footer.description"]) ??
    text(values.description) ??
    text(values["home.hero"]);

  return {
    restaurantName:
      text(values.restaurant_name) ?? text(values.site_name) ?? fallbackSettings.restaurantName,
    description: customDescription ?? fallbackSettings.description,
    descriptionIsCustom: Boolean(customDescription),
    addressLines: address.split(/\r?\n|,\s*(?=\d{4}\s)/).filter(Boolean),
    phone:
      text(values.contact_phone) ??
      text(values.phone) ??
      process.env.NEXT_PUBLIC_RESTAURANT_PHONE ??
      fallbackSettings.phone,
    phoneDisplay:
      text(values.phone_display) ??
      text(values.contact_phone) ??
      text(values.phone) ??
      fallbackSettings.phoneDisplay,
    email:
      text(values.contact_email) ??
      text(values.email) ??
      process.env.NEXT_PUBLIC_RESTAURANT_EMAIL ??
      fallbackSettings.email,
    timezone: text(values.timezone) ?? fallbackSettings.timezone,
  } satisfies StorefrontSettings;
}

function normalizeHours(rows: Row[] | null): OpeningDay[] {
  if (!rows?.length) return fallbackHours;
  const labels = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  const days = new Map<number, OpeningDay>();

  for (const row of rows) {
    const rawDay = number(row.weekday ?? row.day_of_week ?? row.day);
    if (rawDay === undefined) continue;
    const day = rawDay === 7 ? 0 : rawDay;
    if (day < 0 || day > 6) continue;
    const current = days.get(day) ?? {
      day,
      label: text(row.label) ?? labels[day],
      ranges: [],
    };
    const closed = boolean(row.is_closed ?? row.closed, false);
    const start =
      text(row.lunch_opens ?? row.open_time ?? row.opens_at) ??
      text(row.dinner_opens ?? row.second_open_time);
    const end =
      text(row.dinner_closes ?? row.second_close_time) ??
      text(row.lunch_closes ?? row.close_time ?? row.closes_at);
    if (!closed && start && end) {
      current.ranges.push([start.slice(0, 5), end.slice(0, 5)]);
    }
    days.set(day, current);
  }

  return days.size
    ? fallbackHours.map((fallback) => days.get(fallback.day) ?? fallback)
    : fallbackHours;
}

function normalizeMenu(categoryRows: Row[] | null, itemRows: Row[] | null): MenuCategory[] {
  if (!categoryRows?.length || !itemRows?.length) return fallbackMenuCategories;

  const categories = categoryRows
    .filter((row) => boolean(row.is_active))
    .sort((a, b) => (number(a.sort_order) ?? 0) - (number(b.sort_order) ?? 0))
    .map((row) => {
      const databaseId = String(row.id ?? "");
      const id = text(row.slug) ?? text(row.id) ?? "";
      const items = itemRows
        .filter((item) => String(item.category_id ?? "") === databaseId)
        .filter((item) => boolean(item.is_active))
        .sort(
          (a, b) =>
            (number(a.sort_order ?? a.item_number) ?? 0) -
            (number(b.sort_order ?? b.item_number) ?? 0),
        )
        .flatMap((item) => {
          const itemNumber = number(item.item_number ?? item.sort_order);
          const name = text(item.name);
          const price = number(item.price);
          if (itemNumber === undefined || !name || price === undefined) return [];
          const percent = number(item.discount_percent) ?? 0;
          const salePrice = discountedPrice(price, percent);
          const discounted = percent > 0 && salePrice < price;
          return [
            {
              number: itemNumber,
              name,
              descriptionDe: text(item.description_de),
              descriptionEn: text(item.description_en),
              price: discounted ? salePrice : price,
              originalPrice: discounted ? price : undefined,
              discountPercent: discounted ? percent : undefined,
              imageUrl: resolveMenuItemImage(text(item.image_path), itemNumber),
            },
          ];
        });

      return {
        id,
        title: text(row.title) ?? id,
        subtitle: text(row.subtitle),
        noteDe: text(row.note_de),
        noteEn: text(row.note_en),
        items,
      };
    })
    .filter((category) => category.id && category.items.length);

  return categories.length ? categories : fallbackMenuCategories;
}

function firstItemInCategory(categoryId: string, itemRows: Row[] | null): Row | undefined {
  if (!itemRows?.length) return undefined;
  return [...itemRows]
    .filter((item) => String(item.category_id ?? "") === categoryId)
    .filter((item) => boolean(item.is_active))
    .sort(
      (a, b) =>
        (number(a.sort_order ?? a.item_number) ?? 0) -
        (number(b.sort_order ?? b.item_number) ?? 0),
    )[0];
}

/** Category tiles use the first menu item's image (admin uploads), then static fallback. */
function categoryTileImage(categoryId: string, itemRows: Row[] | null, fallbackNumber: number) {
  const first = firstItemInCategory(categoryId, itemRows);
  const itemNumber = number(first?.item_number) ?? fallbackNumber;
  if (first) {
    return resolveMenuItemImage(text(first.image_path), itemNumber);
  }
  return fallbackMenuItemImage(fallbackNumber);
}

function homepageCategoriesFromRows(
  rows: Row[],
  itemRows: Row[] | null,
): HomepageCategory[] {
  return [...rows]
    .filter((row) => boolean(row.is_active))
    .sort((a, b) => (number(a.sort_order) ?? 0) - (number(b.sort_order) ?? 0))
    .flatMap((row) => {
      const id = text(row.slug) ?? text(row.id);
      if (!id) return [];
      const databaseId = String(row.id ?? "");
      return [
        {
          name: text(row.title) ?? id,
          subtitle: text(row.subtitle) ?? "",
          href: `/speisekarte#${id}`,
          image: categoryTileImage(databaseId, itemRows, number(row.sort_order) ?? 1),
        },
      ];
    });
}

function homepageFromFallback(): HomepageCategory[] {
  return fallbackMenuCategories.map((category) => ({
    name: category.title,
    subtitle: category.subtitle ?? "",
    href: `/speisekarte#${category.id}`,
    image: fallbackMenuItemImage(category.items[0]?.number ?? 1),
  }));
}

function normalizeOverride(availabilityRows: Row[] | null) {
  const availability = availabilityRows?.[0];
  return {
    manualOverride:
      availability && !boolean(availability.accepts_orders) ? "closed" : "auto",
    manualMessage: text(availability?.paused_reason),
  } satisfies Pick<StoreStatusConfig, "manualOverride" | "manualMessage">;
}

export const getStorefrontChrome = cache(async (): Promise<StorefrontChrome> => {
  const [settingsRows, contentRows, hourRows, availabilityRows] = await Promise.all([
    readSiteSettings(),
    readContentBlocks(),
    readOpeningHours(),
    readStoreAvailability(),
  ]);

  const settings = normalizeSettings(settingsRows, contentRows);
  const hours = normalizeHours(hourRows);

  return {
    settings,
    hours,
    statusConfig: {
      timezone: settings.timezone,
      hours,
      ...normalizeOverride(availabilityRows),
    },
  };
});

export const getCheckoutPricing = cache(async (): Promise<CheckoutPricing> => {
  const [settingsRows, zoneRows] = await Promise.all([
    readSiteSettings(),
    readDeliveryZoneMinimums(),
  ]);
  const values = keyValueMap(settingsRows);
  const zoneMinimums: Record<string, number> = {};
  for (const row of zoneRows ?? []) {
    const code = text(row.postal_code);
    const minimum = number(row.minimum_order);
    if (code && minimum !== undefined) zoneMinimums[code] = minimum;
  }

  return {
    deliveryMinimum: number(values.delivery_minimum) ?? 0,
    pickupMinimum: number(values.pickup_minimum) ?? 0,
    deliveryFee: number(values.delivery_fee) ?? 0,
    zoneMinimums,
  };
});

export const getHomepageCategories = cache(async (): Promise<HomepageCategory[]> => {
  const [categoryRows, itemRows] = await Promise.all([
    readCategories(),
    readItemPreviews(),
  ]);
  const fromRows = categoryRows?.length
    ? homepageCategoriesFromRows(categoryRows, itemRows)
    : [];
  return fromRows.length ? fromRows : homepageFromFallback();
});

export const getMenuCategories = cache(async (): Promise<MenuCategory[]> => {
  const [categoryRows, itemRows] = await Promise.all([readCategories(), readItems()]);
  return normalizeMenu(categoryRows, itemRows);
});

/** Uploaded menu photos for homepage gallery (skips drinks/sides when possible). */
export const getFlavorGalleryImages = cache(
  async (limit = 8): Promise<Array<{ src: string; alt: string }>> => {
    const itemRows = await readItemPreviews();
    if (!itemRows?.length) return [];

    const skipName =
      /\b(wasser|water|cola|fanta|sprite|getr[aä]nk|drink|pommes|fries|papadam|pappadom|chutney|raita|joghurt|lassi|limo|softdrink)\b/i;

    const activeItems = itemRows
      .filter((item) => boolean(item.is_active) && text(item.image_path))
      .sort(
        (a, b) =>
          (number(a.sort_order ?? a.item_number) ?? 0) -
          (number(b.sort_order ?? b.item_number) ?? 0),
      );

    const score = (name: string) => (skipName.test(name) ? 1 : 0);

    const ranked = [...activeItems].sort((a, b) => {
      const nameA = text(a.name) ?? "";
      const nameB = text(b.name) ?? "";
      return score(nameA) - score(nameB);
    });

    const picked: Array<{ src: string; alt: string }> = [];
    const seenCategories = new Set<string>();

    for (const item of ranked) {
      const name = text(item.name);
      if (!name || skipName.test(name)) continue;
      const categoryId = String(item.category_id ?? "");
      if (!categoryId || seenCategories.has(categoryId)) continue;
      const src = menuImagePublicUrl(text(item.image_path));
      if (!src) continue;
      seenCategories.add(categoryId);
      picked.push({ src, alt: name });
      if (picked.length >= limit) return picked;
    }

    for (const item of ranked) {
      const name = text(item.name);
      if (!name || skipName.test(name)) continue;
      const src = menuImagePublicUrl(text(item.image_path));
      if (!src) continue;
      if (picked.some((entry) => entry.src === src)) continue;
      picked.push({ src, alt: name });
      if (picked.length >= limit) break;
    }

    return picked;
  },
);

export const getStorefrontData = cache(async (): Promise<StorefrontData> => {
  const [chrome, menuCategories, homepageCategories] = await Promise.all([
    getStorefrontChrome(),
    getMenuCategories(),
    getHomepageCategories(),
  ]);

  return { ...chrome, menuCategories, homepageCategories };
});
