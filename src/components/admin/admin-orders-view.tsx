"use client";

import Link from "next/link";
import { reprintOrderBillAction } from "@/app/admin/actions";
import {
  OrderStatusBadge,
  usePrintStatusLabel,
} from "@/components/admin/t";
import { useAdminFormat } from "@/components/admin/format";
import { printStatusClass } from "@/components/admin/status-styles";
import {
  Card,
  EmptyState,
  Notice,
  PageHeader,
  secondaryButtonClass,
} from "@/components/admin/ui";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { useLocale } from "@/lib/i18n/locale-context";

export type OrdersListItem = {
  id: string;
  order_number: number | string | null;
  customer_name: string | null;
  fulfillment_type: string | null;
  created_at: string;
  status: string;
  payment_method: string;
  payment_status: string;
  total: number | string | null;
};

type PrintJob = { status: string } | undefined;

export function AdminOrdersView({
  orders,
  count,
  page,
  pages,
  q,
  status,
  message,
  error,
  printJobsByOrderId,
}: {
  orders: OrdersListItem[];
  count: number;
  page: number;
  pages: number;
  q?: string;
  status?: string;
  message?: string;
  error?: string;
  printJobsByOrderId: Record<string, PrintJob>;
}) {
  const { t } = useLocale();
  const { formatMoney, formatDateTime } = useAdminFormat();
  const printLabel = usePrintStatusLabel();
  const query = { ...(q ? { q } : {}), ...(status ? { status } : {}) };

  return (
    <>
      <PageHeader
        eyebrow={t("admin.orders.eyebrow")}
        title={t("admin.orders.title")}
        description={t("admin.orders.desc", { n: count })}
      />
      <Notice message={message} error={error} />

      <Card>
        {!orders.length ? (
          <EmptyState title={t("admin.orders.emptyTitle")}>
            {t("admin.orders.emptyBody")}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-sage/15 text-xs uppercase tracking-wider text-muted">
                <tr>
                  <th className="pb-3">{t("admin.orders.colOrder")}</th>
                  <th className="pb-3">{t("admin.orders.colCustomer")}</th>
                  <th className="pb-3">{t("admin.orders.colType")}</th>
                  <th className="pb-3">{t("admin.orders.colReceived")}</th>
                  <th className="pb-3">{t("admin.orders.colStatus")}</th>
                  <th className="pb-3">{t("admin.orders.colPayment")}</th>
                  <th className="pb-3">{t("admin.orders.colPrint")}</th>
                  <th className="pb-3 text-right">{t("admin.orders.colTotal")}</th>
                  <th className="pb-3 text-right">{t("admin.orders.colAction")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sage/10">
                {orders.map((order) => {
                  const printJob = printJobsByOrderId[order.id];
                  return (
                    <tr key={order.id} className="transition hover:bg-cream/35">
                      <td className="py-4 font-semibold">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="hover:text-sage-deep hover:underline"
                        >
                          #
                          {order.order_number ?? String(order.id).slice(0, 8)}
                        </Link>
                      </td>
                      <td className="py-4">
                        {order.customer_name ?? t("admin.orders.guest")}
                      </td>
                      <td className="py-4 text-muted">
                        {order.fulfillment_type === "delivery"
                          ? t("admin.orders.delivery")
                          : t("admin.orders.pickup")}
                      </td>
                      <td className="py-4 text-muted">
                        {formatDateTime(order.created_at)}
                      </td>
                      <td className="py-4">
                        <OrderStatusBadge status={order.status} />
                      </td>
                      <td className="py-4">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                              order.payment_method === "cash"
                                ? "bg-sky-100 text-sky-800"
                                : order.payment_status === "paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : order.payment_status === "refunded"
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-amber-100 text-amber-900"
                            }`}
                          >
                            {order.payment_method === "cash"
                              ? t("admin.orders.paymentCash")
                              : order.payment_status === "paid"
                                ? t("admin.payment.paid")
                                : order.payment_status === "refunded"
                                  ? t("admin.payment.refunded")
                                  : t("admin.payment.unpaid")}
                          </span>
                          {order.payment_method !== "cash" ? (
                            <p className="text-xs text-muted">
                              {order.payment_method === "card"
                                ? "Stripe"
                                : order.payment_method}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-4">
                        {printJob ? (
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${printStatusClass(printJob.status)}`}
                          >
                            {printLabel(printJob.status)}
                          </span>
                        ) : (
                          <span className="text-xs text-muted">–</span>
                        )}
                      </td>
                      <td className="py-4 text-right font-semibold">
                        {formatMoney(order.total)}
                      </td>
                      <td className="py-4 text-right">
                        <form action={reprintOrderBillAction} className="inline">
                          <input type="hidden" name="id" value={order.id} />
                          <input type="hidden" name="next" value="/admin/orders" />
                          <PendingSubmitButton
                            variant="secondary"
                            className="!px-3 !py-1.5 !text-xs"
                            pendingLabel="…"
                          >
                            {t("admin.orders.print")}
                          </PendingSubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav
            className="mt-5 flex items-center justify-between border-t border-sage/15 pt-4 text-sm"
            aria-label="Pagination"
          >
            <Link
              aria-disabled={page <= 1}
              className={`${secondaryButtonClass} ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
              href={{
                pathname: "/admin/orders",
                query: { ...query, page: page - 1 },
              }}
            >
              {t("admin.orders.prev")}
            </Link>
            <span className="text-muted">
              {t("admin.orders.page", { n: page, m: pages })}
            </span>
            <Link
              aria-disabled={page >= pages}
              className={`${secondaryButtonClass} ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
              href={{
                pathname: "/admin/orders",
                query: { ...query, page: page + 1 },
              }}
            >
              {t("admin.orders.next")}
            </Link>
          </nav>
        ) : null}
      </Card>
    </>
  );
}
