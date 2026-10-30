import { NextResponse } from "next/server";
import { AppError, isAppError, ValidationError } from "@/backend/errors";
import { createCashOrder } from "@/backend/services/order.service";
import { parseOrderRequest } from "@/backend/validation/order";

export const runtime = "nodejs";

/**
 * Thin transport adapter: it parses the HTTP envelope, delegates to the order
 * service and maps `AppError` onto a status code. All rules live in the backend
 * layer so the customer app can reuse them through a different transport.
 */
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new AppError(
        415,
        "unsupported_media_type",
        "Bestelldaten müssen als JSON gesendet werden.",
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("invalid_json", "Ungültige Bestelldaten.");
    }

    const orderRequest = parseOrderRequest(
      body,
      request.headers.get("Idempotency-Key"),
    );
    const order = await createCashOrder(orderRequest);

    return NextResponse.json(order, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const known = isAppError(error)
      ? error
      : new AppError(
          503,
          "ordering_unavailable",
          "Bestellungen sind vorübergehend nicht verfügbar.",
        );

    return NextResponse.json(
      { error: known.code, message: known.message },
      {
        status: known.status,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
