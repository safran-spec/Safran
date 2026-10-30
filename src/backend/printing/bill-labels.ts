/** Kitchen-facing payment label: Cash on delivery or settled Stripe payment. */
export function kitchenPaymentLabel(
  paymentMethod: string,
  paymentStatus?: string | null,
): string {
  const method = (paymentMethod || "cash").toLowerCase();
  if (method === "cash") return "CASH";
  if (paymentStatus === "refunded") return "STRIPE REFUNDED";
  if (paymentStatus === "paid") return "STRIPE PAID";
  return "STRIPE UNPAID";
}

/** Kitchen-facing fulfillment line. */
export function kitchenFulfillmentLabel(
  fulfillmentType: "pickup" | "delivery",
): string {
  return fulfillmentType === "delivery" ? "DELIVERY" : "PICKUP";
}
