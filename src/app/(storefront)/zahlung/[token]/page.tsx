import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPaymentClientSecretForToken } from "@/backend/services/order.service";
import { StripePaymentForm } from "@/components/stripe-payment-form";

export const metadata: Metadata = {
  title: "Zahlung",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function siteOrigin(): Promise<string> {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (env) return env;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "http";
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

export default async function PaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const payment = await getPaymentClientSecretForToken(token);
  if (!payment) {
    redirect(`/bestellung/${token}`);
  }

  const origin = await siteOrigin();
  const returnUrl = `${origin}/bestellung/${token}`;

  return (
    <section className="bg-paper px-4 pt-24 pb-16 sm:px-6 sm:pt-28 sm:pb-20 lg:px-8">
      <div className="mx-auto max-w-lg">
        <StripePaymentForm
          clientSecret={payment.clientSecret}
          publishableKey={payment.publishableKey}
          orderNumber={payment.orderNumber}
          total={payment.total}
          currency={payment.currency}
          locale={payment.locale}
          returnUrl={returnUrl}
        />
      </div>
    </section>
  );
}
