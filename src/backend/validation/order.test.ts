import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ValidationError } from "@/backend/errors";
import { menuItemNumber, parseOrderRequest } from "@/backend/validation/order";

const validBody = {
  idempotencyKey: "abcdefghijklmnopqrstuvwxyz",
  fulfillment: "pickup",
  paymentMethod: "cash",
  acceptedNoCancellation: true,
  customer: {
    firstName: "Anna",
    lastName: "Muster",
    email: "Anna@Example.COM",
    phone: "0791234567",
  },
  items: [{ id: "menu-12", quantity: 2 }],
};

describe("checkout payload validation", () => {
  it("keeps only identifiers, quantities and contact details", () => {
    const parsed = parseOrderRequest({
      ...validBody,
      items: [{ id: "menu-12", quantity: 2, price: 0.01, name: "Free curry" }],
      subtotal: 0.02,
      total: 0.02,
      deliveryFee: -50,
      discount: 99,
      status: "completed",
      userId: "00000000-0000-0000-0000-000000000000",
      role: "platform_admin",
    });

    assert.deepEqual(parsed.items, [{ id: "menu-12", quantity: 2 }]);
    assert.equal("subtotal" in parsed, false);
    assert.equal("total" in parsed, false);
    assert.equal("deliveryFee" in parsed, false);
    assert.equal("discount" in parsed, false);
    assert.equal("status" in parsed, false);
    assert.equal("userId" in parsed, false);
    assert.equal("role" in parsed, false);
  });

  it("normalizes the email and merges duplicate cart lines", () => {
    const parsed = parseOrderRequest({
      ...validBody,
      items: [
        { id: "menu-12", quantity: 2 },
        { id: "menu-12", quantity: 3 },
      ],
    });

    assert.equal(parsed.customer.email, "anna@example.com");
    assert.deepEqual(parsed.items, [{ id: "menu-12", quantity: 5 }]);
  });

  it("rejects quantities that are not sensible whole numbers", () => {
    for (const quantity of [0, -1, 1.5, 51, "2", null]) {
      assert.throws(
        () => parseOrderRequest({ ...validBody, items: [{ id: "menu-12", quantity }] }),
        ValidationError,
      );
    }
  });

  it("rejects item ids that are not menu references", () => {
    for (const id of ["menu-", "12", "menu-12; drop table orders", ""]) {
      assert.throws(
        () => parseOrderRequest({ ...validBody, items: [{ id, quantity: 1 }] }),
        ValidationError,
      );
    }
  });

  it("requires an empty cart to be refused", () => {
    assert.throws(() => parseOrderRequest({ ...validBody, items: [] }), ValidationError);
  });

  it("requires a complete address for delivery", () => {
    assert.throws(
      () => parseOrderRequest({ ...validBody, fulfillment: "delivery" }),
      ValidationError,
    );
    assert.throws(
      () =>
        parseOrderRequest({
          ...validBody,
          fulfillment: "delivery",
          address: { street: "Hafenstrasse", houseNumber: "31", postalCode: "", city: "Romanshorn" },
        }),
      ValidationError,
    );

    const parsed = parseOrderRequest({
      ...validBody,
      fulfillment: "delivery",
      address: {
        street: "Hafenstrasse",
        houseNumber: "31",
        postalCode: "8590",
        city: "Romanshorn",
        locationUrl: "https://maps.google.com/?q=Romanshorn",
      },
    });
    assert.equal(parsed.address?.postalCode, "8590");
    assert.equal(
      parsed.address?.locationUrl,
      "https://maps.google.com/?q=Romanshorn",
    );

    assert.throws(
      () =>
        parseOrderRequest({
          ...validBody,
          fulfillment: "delivery",
          address: {
            street: "Hafenstrasse",
            houseNumber: "31",
            postalCode: "8590",
            city: "Romanshorn",
            locationUrl: "not-a-link",
          },
        }),
      ValidationError,
    );
  });

  it("drops the address again when the guest switches to pickup", () => {
    const parsed = parseOrderRequest({
      ...validBody,
      address: { street: "X", houseNumber: "1", postalCode: "8590", city: "Y" },
    });

    assert.equal(parsed.address, undefined);
  });

  it("insists on the cancellation policy and a known payment method", () => {
    assert.throws(
      () => parseOrderRequest({ ...validBody, acceptedNoCancellation: false }),
      ValidationError,
    );
    assert.throws(
      () => parseOrderRequest({ ...validBody, paymentMethod: "bitcoin" }),
      ValidationError,
    );
  });

  it("accepts card payment when Stripe is configured", () => {
    const previous = process.env.STRIPE_SECRET_KEY;
    process.env.STRIPE_SECRET_KEY = "sk_test_unit";
    try {
      const parsed = parseOrderRequest({
        ...validBody,
        paymentMethod: "card",
      });
      assert.equal(parsed.paymentMethod, "card");
    } finally {
      if (previous === undefined) delete process.env.STRIPE_SECRET_KEY;
      else process.env.STRIPE_SECRET_KEY = previous;
    }
  });

  it("requires a usable idempotency key and a matching header", () => {
    assert.throws(
      () => parseOrderRequest({ ...validBody, idempotencyKey: "short" }),
      ValidationError,
    );
    assert.throws(
      () => parseOrderRequest(validBody, "a-different-key-1234567890"),
      ValidationError,
    );
    assert.equal(
      parseOrderRequest({ ...validBody, idempotencyKey: undefined }, validBody.idempotencyKey)
        .idempotencyKey,
      validBody.idempotencyKey,
    );
  });

  it("validates contact details", () => {
    assert.throws(
      () =>
        parseOrderRequest({
          ...validBody,
          customer: { ...validBody.customer, email: "not-an-email" },
        }),
      ValidationError,
    );
    assert.throws(
      () =>
        parseOrderRequest({
          ...validBody,
          customer: { ...validBody.customer, email: "a@b" },
        }),
      ValidationError,
    );
    assert.throws(
      () =>
        parseOrderRequest({
          ...validBody,
          customer: { ...validBody.customer, phone: "123" },
        }),
      ValidationError,
    );
    assert.throws(() => parseOrderRequest(null), ValidationError);
  });

  it("extracts the menu item number for the database lookup", () => {
    assert.equal(menuItemNumber("menu-12"), 12);
    assert.throws(() => menuItemNumber("menu-abc"), ValidationError);
  });
});
