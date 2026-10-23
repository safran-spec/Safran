"use client";

import {
  PaymentElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type StripeElementsOptions } from "@stripe/stripe-js";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import { useLocale } from "@/lib/i18n/locale-context";

function PayForm({
  orderNumber,
  totalLabel,
  returnUrl,
}: {
  orderNumber: string;
  totalLabel: string;
  returnUrl: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    setError("");

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: returnUrl,
      },
    });

    if (result.error) {
      setError(result.error.message || t("pay.errorGeneric"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-2xl border border-ink/10 bg-white p-4 sm:p-5">
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="w-full rounded-full bg-gold px-6 py-4 text-sm font-semibold text-ink transition hover:bg-gold-dark disabled:cursor-not-allowed disabled:opacity-40"
      >
        {submitting
          ? t("pay.submitting")
          : t("pay.submit", { total: totalLabel })}
      </button>

      <p className="text-center text-xs text-muted">
        {t("pay.secureHint", { number: orderNumber })}
      </p>

      <p className="text-center text-xs">
        <Link
          href="/kasse?payment=cancelled"
          className="text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          {t("pay.cancel")}
        </Link>
      </p>
    </form>
  );
}

export function StripePaymentForm({
  clientSecret,
  publishableKey,
  orderNumber,
  total,
  currency,
  locale,
  returnUrl,
}: {
  clientSecret: string;
  publishableKey: string;
  orderNumber: string;
  total: number;
  currency: string;
  locale: "de" | "en";
  returnUrl: string;
}) {
  const { t } = useLocale();
  const stripePromise = useMemo(
    () => loadStripe(publishableKey),
    [publishableKey],
  );

  const totalLabel = new Intl.NumberFormat(
    locale === "en" ? "en-CH" : "de-CH",
    { style: "currency", currency },
  ).format(total);

  const options: StripeElementsOptions = {
    clientSecret,
    locale: locale === "en" ? "en" : "de",
    appearance: {
      theme: "stripe",
      variables: {
        colorPrimary: "#1a6b33",
        colorBackground: "#ffffff",
        colorText: "#2f0d29",
        colorDanger: "#b42318",
        fontFamily: "Georgia, 'Times New Roman', serif",
        borderRadius: "12px",
      },
    },
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <div className="mb-6 rounded-3xl border border-ink/10 bg-ink px-5 py-6 text-cream shadow-xl sm:px-7">
        <p className="text-[11px] font-semibold tracking-[0.22em] text-gold uppercase">
          {t("pay.eyebrow")}
        </p>
        <h1 className="mt-2 font-serif text-3xl text-white">{t("pay.title")}</h1>
        <p className="mt-2 text-sm text-cream/70">
          {t("pay.orderLine", { number: orderNumber })}
        </p>
        <p className="mt-4 font-serif text-2xl text-gold">{totalLabel}</p>
      </div>

      <Elements stripe={stripePromise} options={options}>
        <PayForm
          orderNumber={orderNumber}
          totalLabel={totalLabel}
          returnUrl={returnUrl}
        />
      </Elements>
    </div>
  );
}
