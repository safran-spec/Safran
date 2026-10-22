import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getOrderByToken,
  syncStripeCheckoutSession,
} from "@/backend/services/order.service";
import { OrderConfirmationView } from "@/components/order-confirmation-view";

export const metadata: Metadata = {
  title: "Bestellstatus",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type OrderItem = {
  name: string;
  quantity: number;
  line_total: number;
};

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { token } = await params;
  const { session_id: sessionId } = await searchParams;

  // Success-URL backup when the webhook has not fired yet (common in local test).
  if (sessionId) {
    await syncStripeCheckoutSession({
      confirmationToken: token,
      sessionId,
    });
  }

  const order = await getOrderByToken(token);
  if (!order) notFound();

  const items = ((order.order_items ?? []) as OrderItem[]).map((item) => ({
    name: item.name,
    quantity: item.quantity,
    lineTotal: Number(item.line_total),
  }));

  return (
    <section className="bg-paper px-4 pt-20 pb-10 sm:px-6 sm:pt-24 sm:pb-12 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <OrderConfirmationView
          token={token}
          orderNumber={order.order_number}
          status={order.status}
          fulfillmentType={order.fulfillment_type}
          paymentMethod={String(order.payment_method ?? "cash")}
          paymentStatus={String(order.payment_status ?? "pending")}
          items={items}
          total={Number(order.total)}
        />
      </div>
    </section>
  );
}
