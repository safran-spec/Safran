/**
 * Public surface of the backend layer.
 *
 * UI code (server components, server actions, route handlers) should import
 * from here or from a specific service. It must never reach into
 * `repositories/` or `supabase/` directly.
 *
 * The same services are the intended target for a future shared API that the
 * customer app and the rider app call.
 */
export * from "@/backend/errors";
export * from "@/backend/types";

export { CACHE_TAGS } from "@/backend/cache/tags";
export {
  refreshDeliveryZones,
  refreshMenu,
  refreshSettings,
  refreshStoreStatus,
} from "@/backend/cache/revalidate";

export { requireBackOffice, requireCapability } from "@/backend/auth/authorize";
export { getSessionContext, hasSupabaseEnvironment } from "@/backend/auth/session";

export {
  APP_ROLES,
  can,
  isBackOfficeRole,
  normalizeRole,
  type Capability,
} from "@/backend/domain/roles";
export {
  allowedTransitions,
  allowedTransitionsFor,
  assertTransition,
  canTransition,
  isOrderStatus,
  ORDER_STATUSES,
} from "@/backend/domain/order-status";
export {
  calculateOrderTotals,
  money,
  type OrderTotals,
  type PricingRules,
} from "@/backend/domain/order-pricing";

export { parseOrderRequest } from "@/backend/validation/order";

export * as authService from "@/backend/services/auth.service";
export * as menuService from "@/backend/services/menu.service";
export * as orderService from "@/backend/services/order.service";
export * as printService from "@/backend/services/print.service";
export * as settingsService from "@/backend/services/settings.service";
export * as deliveryZoneService from "@/backend/services/delivery-zone.service";
export {
  getCheckoutPricing,
  getFlavorGalleryImages,
  getHomepageCategories,
  getMenuCategories,
  getStorefrontChrome,
  getStorefrontData,
  type CheckoutPricing,
  type HomepageCategory,
  type StorefrontChrome,
  type StorefrontData,
  type StorefrontSettings,
} from "@/backend/services/storefront.service";
