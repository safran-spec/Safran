import { ConflictError, ValidationError } from "@/backend/errors";
import { can, type AppRole } from "@/backend/domain/roles";

/**
 * Single source of truth for the order lifecycle. The admin site, the future
 * customer app and the future rider app must all go through `assertTransition`,
 * so no caller can push an order into an arbitrary status.
 *
 * These are the values currently present in the `public.order_status` enum.
 * Delivery statuses (`assigned_to_rider`, `picked_up`, `delivered`) are added
 * here and in the enum together, once rider assignment storage exists.
 */
export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const INITIAL_ORDER_STATUS: OrderStatus = "pending";

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["out_for_delivery", "completed", "cancelled"],
  out_for_delivery: ["completed", "cancelled"],
  // Staff must be able to cancel a closed order too (wrong handover, refund).
  completed: ["cancelled"],
  cancelled: [],
};

/**
 * Orders close themselves once the promised waiting time has passed, so staff
 * never walk the kitchen statuses. These minutes are the same ones the guest
 * sees on the confirmation page.
 */
export const AUTO_COMPLETE_MINUTES = {
  delivery: 60,
  pickup: 60,
} as const;

/** Statuses an order can sit in before it auto-completes. */
export const OPEN_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "ready",
  "out_for_delivery",
] as const satisfies readonly OrderStatus[];

/** Oldest `created_at` that may still stay open for this fulfillment type. */
export function autoCompleteCutoff(
  fulfillment: keyof typeof AUTO_COMPLETE_MINUTES,
  now = new Date(),
): Date {
  return new Date(now.getTime() - AUTO_COMPLETE_MINUTES[fulfillment] * 60_000);
}

/**
 * Which role may perform a transition. Restaurant staff run the kitchen flow;
 * handing an order over to a rider and closing a delivery is reserved for roles
 * that hold the delivery capabilities.
 */
const REQUIRED_CAPABILITY: Partial<
  Record<OrderStatus, "orders:transition" | "riders:assign" | "deliveries:handle">
> = {
  out_for_delivery: "riders:assign",
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return ORDER_STATUSES.includes(value as OrderStatus);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

/** Transitions a specific role is allowed to perform from the given status. */
export function allowedTransitionsFor(
  role: AppRole | null,
  from: OrderStatus,
): OrderStatus[] {
  return TRANSITIONS[from].filter((to) =>
    can(role, REQUIRED_CAPABILITY[to] ?? "orders:transition"),
  );
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Throws unless the transition is part of the lifecycle and the actor's role
 * covers it. Call this before every status write.
 */
export function assertTransition(
  from: OrderStatus,
  to: unknown,
  role: AppRole | null,
): OrderStatus {
  if (!isOrderStatus(to)) {
    throw new ValidationError("invalid_status", "Unbekannter Bestellstatus.");
  }
  if (!canTransition(from, to)) {
    throw new ConflictError(
      "invalid_transition",
      `Übergang von ${from} zu ${to} ist nicht erlaubt.`,
    );
  }
  if (!can(role, REQUIRED_CAPABILITY[to] ?? "orders:transition")) {
    throw new ConflictError(
      "transition_not_permitted",
      "Für diesen Statuswechsel fehlt die Berechtigung.",
    );
  }
  return to;
}
