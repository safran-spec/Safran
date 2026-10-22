/** Kitchen-facing payment line: COD vs PAID (Stripe). */
export function kitchenPaymentLabel(
  paymentMethod: string,
  paymentStatus?: string | null,
): string {
  const method = (paymentMethod || "cash").toLowerCase();
  if (method === "cash") return "COD";
  if (paymentStatus === "paid") return "PAID (Stripe)";
  return "ONLINE — UNPAID";
}

/** Kitchen-facing fulfillment line. */
export function kitchenFulfillmentLabel(
  fulfillmentType: "pickup" | "delivery",
): string {
  return fulfillmentType === "delivery" ? "DELIVERY" : "PICKUP";
}
