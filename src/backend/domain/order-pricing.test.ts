import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertMinimumOrder,
  calculateOrderTotals,
  discountedPrice,
  money,
  normalizePostalCode,
  resolveDeliveryMinimum,
  type PricedLine,
  type PricingRules,
} from "@/backend/domain/order-pricing";
import { ConflictError } from "@/backend/errors";

const rules: PricingRules = {
  deliveryFee: 6.5,
  deliveryMinimum: 30,
  pickupMinimum: 0,
};

function line(unitPrice: number, quantity: number): PricedLine {
  return { menuItemId: "1", name: "Curry", quantity, unitPrice };
}

describe("order totals", () => {
  it("sums line totals and adds the delivery fee", () => {
    const totals = calculateOrderTotals(
      [line(18.5, 2), line(4.9, 1)],
      "delivery",
      rules,
    );

    assert.equal(totals.subtotal, 41.9);
    assert.equal(totals.deliveryFee, 6.5);
    assert.equal(totals.total, 48.4);
  });

  it("charges no delivery fee on pickup", () => {
    const totals = calculateOrderTotals([line(18.5, 2)], "pickup", rules);

    assert.equal(totals.deliveryFee, 0);
    assert.equal(totals.total, 37);
  });

  it("rounds to whole cents instead of accumulating float error", () => {
    const totals = calculateOrderTotals([line(0.1, 3)], "pickup", rules);

    assert.equal(totals.subtotal, 0.3);
    assert.equal(money(19.99 * 3), 59.97);
    assert.equal(money(1.005), 1.01);
  });

  it("never turns a negative fee into a discount", () => {
    const totals = calculateOrderTotals([line(10, 1)], "delivery", {
      ...rules,
      deliveryFee: -20,
    });

    assert.equal(totals.deliveryFee, 0);
    assert.equal(totals.total, 10);
  });

  it("ignores anything the client attached to a cart line", () => {
    const tampered = {
      ...line(18.5, 2),
      price: 0.01,
      lineTotal: 0.02,
      total: 0.02,
    } as PricedLine;

    assert.equal(calculateOrderTotals([tampered], "pickup", rules).total, 37);
  });

  it("enforces the delivery minimum but not the pickup minimum", () => {
    assert.throws(() => assertMinimumOrder(29.95, "delivery", rules), ConflictError);
    assert.doesNotThrow(() => assertMinimumOrder(30, "delivery", rules));
    assert.doesNotThrow(() => assertMinimumOrder(5, "pickup", rules));
  });

  it("reports the minimum that was missed", () => {
    assert.throws(
      () => assertMinimumOrder(10, "delivery", rules),
      /CHF 30\.00/,
    );
  });
});

describe("postal delivery minimums", () => {
  const zones = [
    { postalCode: "8590", minimumOrder: 40 },
    { postalCode: "8280", minimumOrder: 50 },
  ];

  it("normalizes spaces in Swiss PLZ", () => {
    assert.equal(normalizePostalCode(" 85 90 "), "8590");
  });

  it("uses the zone minimum when the PLZ matches", () => {
    assert.equal(resolveDeliveryMinimum("8590", zones, 30), 40);
    assert.equal(resolveDeliveryMinimum("85 90", zones, 30), 40);
  });

  it("falls back to the global delivery minimum", () => {
    assert.equal(resolveDeliveryMinimum("8000", zones, 30), 30);
    assert.equal(resolveDeliveryMinimum("", zones, 30), 30);
  });
});

describe("dish discounts", () => {
  it("reduces the price by the given percentage, rounded to cents", () => {
    assert.equal(discountedPrice(18.5, 20), 14.8);
    assert.equal(discountedPrice(11.9, 15), 10.12);
    assert.equal(discountedPrice(9.9, 12.5), 8.66);
  });

  it("leaves the price alone without a usable discount", () => {
    assert.equal(discountedPrice(18.5, 0), 18.5);
    assert.equal(discountedPrice(18.5, null), 18.5);
    assert.equal(discountedPrice(18.5, "not a number"), 18.5);
    assert.equal(discountedPrice(18.5, -30), 18.5);
  });

  it("never gives a dish away, however high the percentage", () => {
    assert.equal(discountedPrice(100, 999), 1);
  });
});
