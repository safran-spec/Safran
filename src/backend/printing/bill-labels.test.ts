import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  kitchenFulfillmentLabel,
  kitchenPaymentLabel,
} from "@/backend/printing/bill-labels";

describe("kitchen bill labels", () => {
  it("labels cash orders as cash regardless of payment_status", () => {
    assert.equal(kitchenPaymentLabel("cash", "pending"), "CASH");
    assert.equal(kitchenPaymentLabel("cash", "paid"), "CASH");
    assert.equal(kitchenPaymentLabel("CASH", null), "CASH");
  });

  it("labels Stripe orders paid or unpaid explicitly", () => {
    assert.equal(kitchenPaymentLabel("card", "paid"), "STRIPE PAID");
    assert.equal(kitchenPaymentLabel("card", "pending"), "STRIPE UNPAID");
  });

  it("labels refunded orders distinctly", () => {
    assert.equal(kitchenPaymentLabel("card", "refunded"), "STRIPE REFUNDED");
  });

  it("labels fulfillment for kitchen sorting", () => {
    assert.equal(kitchenFulfillmentLabel("delivery"), "DELIVERY");
    assert.equal(kitchenFulfillmentLabel("pickup"), "PICKUP");
  });
});
