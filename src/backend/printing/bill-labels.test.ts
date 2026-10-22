import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  kitchenFulfillmentLabel,
  kitchenPaymentLabel,
} from "@/backend/printing/bill-labels";

describe("kitchen bill labels", () => {
  it("labels cash as COD regardless of payment_status", () => {
    assert.equal(kitchenPaymentLabel("cash", "pending"), "COD");
    assert.equal(kitchenPaymentLabel("cash", "paid"), "COD");
    assert.equal(kitchenPaymentLabel("CASH", null), "COD");
  });

  it("labels paid Stripe as PAID and unpaid online clearly", () => {
    assert.equal(kitchenPaymentLabel("card", "paid"), "PAID (Stripe)");
    assert.equal(kitchenPaymentLabel("card", "pending"), "ONLINE — UNPAID");
  });

  it("labels fulfillment for kitchen sorting", () => {
    assert.equal(kitchenFulfillmentLabel("delivery"), "DELIVERY");
    assert.equal(kitchenFulfillmentLabel("pickup"), "PICKUP");
  });
});
