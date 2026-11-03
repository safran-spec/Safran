"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  refreshDeliveryZones,
  refreshMenu,
  refreshSettings,
  refreshStoreStatus,
} from "@/backend/cache/revalidate";
import { AuthorizationError, ConflictError, isAppError } from "@/backend/errors";
import { signInToBackOffice, signOut } from "@/backend/services/auth.service";
import * as deliveryZoneService from "@/backend/services/delivery-zone.service";
import * as menuService from "@/backend/services/menu.service";
import * as orderService from "@/backend/services/order.service";
import * as printService from "@/backend/services/print.service";
import * as settingsService from "@/backend/services/settings.service";

/**
 * Server Actions are transport adapters only: read the form, call a service,
 * turn the result into a redirect. Business rules, validation and authorization
 * live in `src/backend`, so the customer and rider apps can reuse them.
 */

const LOGIN_PATH = "/admin/login";
const MENU_PATH = "/admin/menu";
const DISCOUNTS_PATH = "/admin/discounts";
const SETTINGS_PATH = "/admin/settings";
const DELIVERY_ZONES_PATH = "/admin/delivery-zones";

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function numberValue(formData: FormData, key: string, fallback = 0) {
  const value = Number(formData.get(key));
  return Number.isFinite(value) ? value : fallback;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}

function file(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size ? value : null;
}

/** Only allows redirects back into the admin area. */
function safeAdminPath(value: string, fallback: string) {
  return value.startsWith("/admin") && !value.startsWith("//")
    ? value.split("?")[0]
    : fallback;
}

function destination(path: string, kind: "message" | "error", value: string): never {
  redirect(`${path}?${new URLSearchParams({ [kind]: value })}`);
}

/**
 * Runs a service call and converts its outcome into a redirect. An expired or
 * unprivileged session ends at the login screen; everything else surfaces the
 * service's own message.
 *
 * `successKey` and the error value are i18n keys rather than finished text, so
 * `Notice` renders the flash in whichever language the admin is using. Errors
 * carry `key::fallback` because services may raise codes we have no wording
 * for yet.
 */
async function handle(
  returnTo: string,
  operation: () => Promise<void>,
  successKey: string,
  invalidate?: () => void,
): Promise<never> {
  let failure: string | null = null;

  try {
    await operation();
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "unauthenticated") {
        redirect(`${LOGIN_PATH}?next=${encodeURIComponent(returnTo)}`);
      }
      await signOut();
      destination(LOGIN_PATH, "error", `admin.err.${error.code}::${error.message}`);
    }
    failure = isAppError(error)
      ? `admin.err.${error.code}::${error.message}`
      : "admin.err.generic";
  }

  if (failure) destination(returnTo, "error", failure);

  invalidate?.();
  destination(returnTo, "message", successKey);
}

export async function loginAction(formData: FormData) {
  const safeNext = safeAdminPath(text(formData, "next"), "/admin");

  try {
    await signInToBackOffice({
      email: text(formData, "email"),
      password: text(formData, "password"),
    });
  } catch (error) {
    destination(
      LOGIN_PATH,
      "error",
      isAppError(error)
        ? `admin.err.${error.code}::${error.message}`
        : "admin.err.login_failed",
    );
  }

  redirect(safeNext);
}

export async function logoutAction() {
  await signOut();
  redirect(LOGIN_PATH);
}

export async function setStoreOpenAction(formData: FormData) {
  const isOpen = checked(formData, "is_open");
  const returnTo = safeAdminPath(text(formData, "next"), "/admin");

  await handle(
    returnTo,
    () => settingsService.setStoreOpen(isOpen),
    isOpen ? "admin.msg.storeOpen" : "admin.msg.storeClosed",
    refreshStoreStatus,
  );
}

export async function updateOrderStatusAction(formData: FormData) {
  const id = text(formData, "id");
  const returnTo = `/admin/orders/${encodeURIComponent(id)}`;

  await handle(
    returnTo,
    () =>
      orderService
        .updateOrderStatus({ orderId: id, nextStatus: text(formData, "status") })
        .then(() => undefined),
    "admin.msg.orderStatusUpdated",
    () => revalidatePath("/admin/orders"),
  );
}

export async function reprintOrderBillAction(formData: FormData) {
  const id = text(formData, "id");
  const returnTo = safeAdminPath(
    text(formData, "next") || `/admin/orders/${encodeURIComponent(id)}`,
    `/admin/orders/${encodeURIComponent(id)}`,
  );

  await handle(
    returnTo,
    async () => {
      const job = await printService.reprintOrderBill(id);
      if (job?.status === "failed") {
        // With printer details there is no useful translation, so use a code
        // without wording and let the raw reason through instead.
        throw job.last_error
          ? new ConflictError(
              "print_failed_detail",
              `Printing failed: ${job.last_error}`,
            )
          : new ConflictError("print_failed", "Printing failed.");
      }
    },
    "admin.msg.billSent",
    () => {
      revalidatePath("/admin/orders");
      revalidatePath(returnTo);
    },
  );
}

export async function createCategoryAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () =>
      menuService.createCategory({
        id: text(formData, "id"),
        name: text(formData, "name"),
        description: text(formData, "description"),
        sortOrder: numberValue(formData, "sort_order"),
        isActive: checked(formData, "is_active"),
      }),
    "admin.msg.categoryCreated",
    refreshMenu,
  );
}

export async function updateCategoryAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () =>
      menuService.updateCategory({
        id: text(formData, "id"),
        name: text(formData, "name"),
        description: text(formData, "description"),
        sortOrder: numberValue(formData, "sort_order"),
        isActive: checked(formData, "is_active"),
      }),
    "admin.msg.categorySaved",
    refreshMenu,
  );
}

export async function deleteCategoryAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () => menuService.deleteCategory({ id: text(formData, "id") }),
    "admin.msg.categoryDeleted",
    refreshMenu,
  );
}

export async function sortCategoriesAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () => menuService.sortCategories({ orderedIds: text(formData, "ordered_ids") }),
    "admin.msg.categoriesSorted",
    refreshMenu,
  );
}

function menuItemFields(formData: FormData) {
  return {
    categoryId: text(formData, "category_id"),
    itemNumber: numberValue(formData, "number"),
    name: text(formData, "name"),
    descriptionDe: text(formData, "description_de"),
    descriptionEn: text(formData, "description_en"),
    price: numberValue(formData, "price"),
    sortOrder: numberValue(formData, "sort_order"),
    isActive: checked(formData, "is_available"),
  };
}

export type CreateMenuItemState = {
  error?: string;
  stamp?: number;
  values?: {
    category_id: string;
    number: string;
    name: string;
    description_de: string;
    description_en: string;
    price: string;
    sort_order: string;
    is_available: boolean;
  };
};

function readCreateMenuItemDraft(
  formData: FormData,
): NonNullable<CreateMenuItemState["values"]> {
  return {
    category_id: text(formData, "category_id"),
    number: String(formData.get("number") ?? "").trim(),
    name: text(formData, "name"),
    description_de: text(formData, "description_de"),
    description_en: text(formData, "description_en"),
    price: String(formData.get("price") ?? "").trim(),
    sort_order: String(formData.get("sort_order") ?? "").trim(),
    is_available: checked(formData, "is_available"),
  };
}

export async function createMenuItemAction(
  _prev: CreateMenuItemState,
  formData: FormData,
): Promise<CreateMenuItemState> {
  const values = readCreateMenuItemDraft(formData);

  try {
    await menuService.createMenuItem(
      {
        categoryId: values.category_id,
        itemNumber: numberValue(formData, "number"),
        name: values.name,
        descriptionDe: values.description_de,
        descriptionEn: values.description_en,
        price: numberValue(formData, "price"),
        sortOrder: numberValue(formData, "sort_order"),
        isActive: values.is_available,
      },
      file(formData, "image"),
    );
  } catch (error) {
    if (error instanceof AuthorizationError) {
      if (error.code === "unauthenticated") {
        redirect(`${LOGIN_PATH}?next=${encodeURIComponent(MENU_PATH)}`);
      }
      await signOut();
      destination(LOGIN_PATH, "error", `admin.err.${error.code}::${error.message}`);
    }
    return {
      error: isAppError(error)
        ? `admin.err.${error.code}::${error.message}`
        : "admin.err.generic",
      values,
      stamp: Date.now(),
    };
  }

  refreshMenu();
  destination(MENU_PATH, "message", "admin.msg.itemCreated");
}

export async function updateMenuItemAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () =>
      menuService.updateMenuItem({
        ...menuItemFields(formData),
        id: numberValue(formData, "id"),
      }),
    "admin.msg.itemSaved",
    refreshMenu,
  );
}

export async function setMenuItemAvailabilityAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () =>
      menuService.setMenuItemAvailability({
        id: numberValue(formData, "id"),
        isAvailable: checked(formData, "is_available"),
      }),
    "admin.msg.availabilityUpdated",
    refreshMenu,
  );
}

export async function applyMenuDiscountAction(formData: FormData) {
  await handle(
    DISCOUNTS_PATH,
    () =>
      menuService
        .setMenuItemsDiscount({
          ids: formData.getAll("ids"),
          percent: formData.get("percent"),
        })
        .then(() => undefined),
    "admin.msg.discountApplied",
    refreshMenu,
  );
}

export async function clearMenuDiscountAction(formData: FormData) {
  await handle(
    DISCOUNTS_PATH,
    () =>
      menuService
        .setMenuItemsDiscount({ ids: formData.getAll("ids"), percent: 0 })
        .then(() => undefined),
    "admin.msg.discountCleared",
    refreshMenu,
  );
}

export async function sortMenuItemsAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () => menuService.sortMenuItems({ orderedIds: text(formData, "ordered_ids") }),
    "admin.msg.itemsSorted",
    refreshMenu,
  );
}

export async function replaceMenuItemImageAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () =>
      menuService.replaceMenuItemImage(
        { id: numberValue(formData, "id") },
        file(formData, "image"),
      ),
    "admin.msg.itemImageReplaced",
    refreshMenu,
  );
}

export async function deleteMenuItemAction(formData: FormData) {
  await handle(
    MENU_PATH,
    () => menuService.deleteMenuItem({ id: numberValue(formData, "id") }),
    "admin.msg.itemDeleted",
    refreshMenu,
  );
}

export async function updateSettingsAction(formData: FormData) {
  await handle(
    SETTINGS_PATH,
    () =>
      settingsService.updateRestaurantSettings({
        restaurantName: text(formData, "restaurant_name"),
        email: text(formData, "email"),
        phone: text(formData, "phone"),
        address: text(formData, "address"),
        deliveryMinimum: numberValue(formData, "minimum_order"),
        pickupMinimum: numberValue(formData, "pickup_minimum"),
        deliveryFee: numberValue(formData, "delivery_fee"),
        pickupEnabled: checked(formData, "pickup_enabled"),
        deliveryEnabled: checked(formData, "delivery_enabled"),
        minimumNoticeMinutes: numberValue(formData, "minimum_notice_minutes", 30),
      }),
    "admin.msg.settingsSaved",
    refreshSettings,
  );
}

export async function updateOpeningHoursAction(formData: FormData) {
  const days = Array.from({ length: 7 }, (_, day) => ({
    weekday: day,
    isClosed: checked(formData, `day_${day}_closed`),
    opens: text(formData, `day_${day}_open`),
    closes: text(formData, `day_${day}_close`),
  }));

  await handle(
    SETTINGS_PATH,
    () => settingsService.updateOpeningHours(days),
    "admin.msg.hoursSaved",
    refreshSettings,
  );
}

export async function setOrderAlertEnabledAction(formData: FormData) {
  await handle(
    SETTINGS_PATH,
    () => settingsService.setOrderAlertEnabled(checked(formData, "enabled")),
    "admin.msg.alertSaved",
    refreshSettings,
  );
}

export async function uploadOrderAlertSoundAction(formData: FormData) {
  const audio = file(formData, "sound");
  if (!audio) {
    destination(SETTINGS_PATH, "error", "admin.err.audioRequired");
  }
  await handle(
    SETTINGS_PATH,
    () => settingsService.uploadOrderAlertSound(audio),
    "admin.msg.soundUploaded",
    refreshSettings,
  );
}

export async function clearOrderAlertSoundAction(_formData?: FormData) {
  await handle(
    SETTINGS_PATH,
    () => settingsService.clearOrderAlertSound(),
    "admin.msg.soundRemoved",
    refreshSettings,
  );
}

export async function updateDefaultDeliveryMinimumAction(formData: FormData) {
  await handle(
    DELIVERY_ZONES_PATH,
    () =>
      settingsService.updateDefaultDeliveryMinimum(
        numberValue(formData, "minimum_order"),
      ),
    "admin.msg.defaultMinimumSaved",
    () => {
      refreshSettings();
      refreshDeliveryZones();
    },
  );
}

export async function createDeliveryZoneAction(formData: FormData) {
  await handle(
    DELIVERY_ZONES_PATH,
    () =>
      deliveryZoneService.createDeliveryZone({
        postalCode: text(formData, "postal_code"),
        minimumOrder: numberValue(formData, "minimum_order"),
        isActive: checked(formData, "is_active"),
      }),
    "admin.msg.zoneCreated",
    refreshDeliveryZones,
  );
}

export async function updateDeliveryZoneAction(formData: FormData) {
  await handle(
    DELIVERY_ZONES_PATH,
    () =>
      deliveryZoneService.updateDeliveryZone({
        id: numberValue(formData, "id"),
        postalCode: text(formData, "postal_code"),
        minimumOrder: numberValue(formData, "minimum_order"),
        isActive: checked(formData, "is_active"),
      }),
    "admin.msg.zoneSaved",
    refreshDeliveryZones,
  );
}

export async function deleteDeliveryZoneAction(formData: FormData) {
  await handle(
    DELIVERY_ZONES_PATH,
    () =>
      deliveryZoneService.deleteDeliveryZone({
        id: numberValue(formData, "id"),
      }),
    "admin.msg.zoneDeleted",
    refreshDeliveryZones,
  );
}
