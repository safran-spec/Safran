"use client";

import Link from "next/link";
import { useLocale } from "@/lib/i18n/locale-context";
import { localizedDishName } from "@/lib/i18n/menu-text";
import { OrderStatusLive } from "@/components/order-status-live";

export type OrderConfirmationItem = {
  name: string;
  quantity: number;
  lineTotal: number;
};

export function OrderConfirmationView({
  token,
  orderNumber,
  status,
  fulfillmentType,
  paymentMethod = "cash",
  paymentStatus = "pending",
  items,
  total,
}: {
  token: string;
  orderNumber: string;
  status: string;
  fulfillmentType: string;
  paymentMethod?: string;
  paymentStatus?: string;
  items: OrderConfirmationItem[];
  total: number;
}) {
  const { t, locale } = useLocale();

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat(locale === "en" ? "en-CH" : "de-CH", {
      style: "currency",
      currency: "CHF",
    }).format(value);

  const paymentNote =
    paymentMethod === "card"
      ? paymentStatus === "paid"
        ? t("order.page.paidOnline")
        : t("order.page.paymentPending")
      : fulfillmentType === "delivery"
        ? t("order.page.cashOnDelivery")
        : t("order.page.cashOnPickup");

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-6 lg:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.22em] text-sage uppercase">
            {t("order.page.orderLabel", { number: orderNumber })}
          </p>
          <h1 className="mt-1 font-serif text-2xl text-ink sm:text-3xl lg:text-[2rem] lg:leading-tight">
            {t("order.page.thanks")}
          </h1>
        </div>
        <Link
          href="/speisekarte"
          className="inline-flex shrink-0 rounded-full bg-sage px-4 py-2 text-xs font-semibold text-white transition hover:bg-sage-dark"
        >
          {t("checkout.toMenu")}
        </Link>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-start lg:gap-6">
        <OrderStatusLive
          token={token}
          initialStatus={status}
          fulfillmentType={fulfillmentType}
          orderNumber={orderNumber}
        />

        <aside className="space-y-4">
          <div className="rounded-xl border border-ink/10 bg-paper/60 p-4">
            <h2 className="font-serif text-xl text-ink">
              {t("order.page.summary")}
            </h2>
            <ul className="mt-2 divide-y divide-ink/10">
              {items.map((item, index) => (
                <li
                  key={`${item.name}-${index}`}
                  className="flex justify-between gap-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    {item.quantity} × {localizedDishName(item.name, locale)}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {formatCurrency(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-between border-t border-ink/15 pt-3 text-sm font-semibold">
              <span>{t("checkout.total")}</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-muted">{paymentNote}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
