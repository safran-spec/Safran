/**
 * Shared backend contracts. These describe what services accept and return, so
 * a future REST or RPC layer can be generated from them without touching
 * business logic.
 */
import type { Fulfillment } from "@/backend/domain/order-pricing";
import type { OrderStatus } from "@/backend/domain/order-status";
import type { AppRole } from "@/backend/domain/roles";

export type { Fulfillment, OrderStatus, AppRole };

export type PaymentMethod = "cash" | "card";

export type CustomerContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type DeliveryAddress = {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  /** Optional Google Maps / WhatsApp / other location share link. */
  locationUrl?: string;
};

export type CartLineInput = {
  /** Public menu identifier, `menu-<item_number>`. Prices are never accepted. */
  id: string;
  quantity: number;
};

export type OrderRequest = {
  idempotencyKey: string;
  fulfillment: Fulfillment;
  paymentMethod: PaymentMethod;
  acceptedNoCancellation: boolean;
  customer: CustomerContact;
  address?: DeliveryAddress;
  notes?: string;
  items: CartLineInput[];
  /** Language the guest checked out in; drives the confirmation emails. */
  locale: "de" | "en";
};

export type CreatedOrder = {
  orderNumber: string;
  confirmationToken: string;
  total: number;
  currency: "CHF";
  status: string;
  /**
   * Stripe PaymentIntent client secret for the embedded Safran payment page.
   * When set, the guest is sent to `/zahlung/[token]` instead of hosted Checkout.
   */
  clientSecret?: string;
  /** @deprecated Hosted Checkout URL — prefer clientSecret + /zahlung. */
  checkoutUrl?: string;
  paymentMethod: PaymentMethod;
};

/** Identity resolved from the trusted server-side session, never from input. */
export type Actor = {
  userId: string;
  email?: string;
  role: AppRole;
};

export type CategoryInput = {
  id?: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export type MenuItemInput = {
  categoryId: string;
  itemNumber: number;
  name: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  price: number;
  sortOrder: number;
  isActive: boolean;
};

export type RestaurantSettingsInput = {
  restaurantName: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  deliveryMinimum: number;
  pickupMinimum: number;
  deliveryFee: number;
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  minimumNoticeMinutes: number;
};

export type OpeningHoursInput = Array<{
  weekday: number;
  isClosed: boolean;
  opens: string | null;
  closes: string | null;
}>;
