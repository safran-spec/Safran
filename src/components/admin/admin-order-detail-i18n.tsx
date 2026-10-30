"use client";

import Link from "next/link";
import {
  reprintOrderBillAction,
  updateOrderStatusAction,
} from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { useAdminFormat } from "@/components/admin/format";
import { OrderBillPreview } from "@/components/admin/order-bill-preview";
import { printStatusClass } from "@/components/admin/status-styles";
import {
  OrderStatusBadge,
  useActionLabel,
  usePrintStatusLabel,
} from "@/components/admin/t";
import {
  Card,
  PageHeader,
  secondaryButtonClass,
} from "@/components/admin/ui";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { useLocale } from "@/lib/i18n/locale-context";
import { localizedDishName } from "@/lib/i18n/menu-text";

const labelClass = "text-xs uppercase tracking-wider text-muted";

export function AdminOrderDetailHeader({
  id,
  orderNumber,
  createdAt,
}: {
  id: string;
  orderNumber: string | number | null | undefined;
  createdAt: string | null | undefined;
}) {
  const { t } = useLocale();
  const { formatDateTime } = useAdminFormat();
  const n = orderNumber ?? String(id).slice(0, 8);

  return (
    <PageHeader
      eyebrow={t("admin.detail.eyebrow")}
      title={t("admin.detail.title", { n })}
      description={t("admin.detail.received", {
        date: formatDateTime(createdAt),
      })}
      action={
        <Link href="/admin/orders" className={secondaryButtonClass}>
          {t("admin.detail.back")}
        </Link>
      }
    />
  );
}

export function AdminOrderStatusCard({
  orderId,
  status,
  transitions,
}: {
  orderId: string;
  status: string;
  transitions: string[];
}) {
  const { t } = useLocale();
  const actionLabel = useActionLabel();

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wider text-muted uppercase">
            {t("admin.detail.currentStatus")}
          </p>
          <div className="mt-2">
            <OrderStatusBadge status={status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {transitions.map((next) => (
            <form action={updateOrderStatusAction} key={next}>
              <input type="hidden" name="id" value={orderId} />
              <input type="hidden" name="status" value={next} />
              {next === "cancelled" ? (
                <ConfirmSubmitButton
                  label={actionLabel(next)}
                  title={t("admin.detail.cancelConfirmTitle")}
                  body={t("admin.detail.cancelConfirmBody")}
                  confirmLabel={t("admin.detail.cancelConfirm")}
                  cancelLabel={t("admin.detail.cancelKeep")}
                  pendingLabel={t("admin.detail.updating")}
                />
              ) : (
                <PendingSubmitButton pendingLabel={t("admin.detail.updating")}>
                  {actionLabel(next)}
                </PendingSubmitButton>
              )}
            </form>
          ))}
        </div>
      </div>
    </Card>
  );
}

export type PrintJobSummary = {
  status: string;
  attempts: number;
  max_attempts: number;
  printed_at: string | null;
  next_attempt_at: string | null;
  last_error: string | null;
};

export function AdminOrderBillCard({
  orderId,
  printJob,
}: {
  orderId: string;
  printJob: PrintJobSummary | null;
}) {
  const { t } = useLocale();
  const { formatDateTime } = useAdminFormat();
  const printStatusLabel = usePrintStatusLabel();

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-sans text-2xl font-semibold tracking-tight">
            {t("admin.detail.billTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t("admin.detail.billDesc")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrderBillPreview orderId={orderId} />
          <form action={reprintOrderBillAction}>
            <input type="hidden" name="id" value={orderId} />
            <input
              type="hidden"
              name="next"
              value={`/admin/orders/${orderId}`}
            />
            <PendingSubmitButton
              variant="secondary"
              pendingLabel={t("admin.detail.billPrintPending")}
            >
              {t("admin.detail.billPrint")}
            </PendingSubmitButton>
          </form>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className={labelClass}>{t("admin.detail.printStatus")}</dt>
          <dd className="mt-1">
            {printJob ? (
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${printStatusClass(printJob.status)}`}
              >
                {printStatusLabel(printJob.status)}
              </span>
            ) : (
              <span className="text-muted">
                {t("admin.detail.noPrintJob")}
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.attempts")}</dt>
          <dd className="mt-1 font-semibold">
            {printJob
              ? `${printJob.attempts} / ${printJob.max_attempts}`
              : "–"}
          </dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.lastPrinted")}</dt>
          <dd className="mt-1">{formatDateTime(printJob?.printed_at)}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.nextAttempt")}</dt>
          <dd className="mt-1">
            {printJob &&
            (printJob.status === "pending" || printJob.status === "failed")
              ? formatDateTime(printJob.next_attempt_at)
              : "–"}
          </dd>
        </div>
        {printJob?.last_error ? (
          <div className="sm:col-span-2">
            <dt className={labelClass}>{t("admin.detail.lastError")}</dt>
            <dd className="mt-1 rounded-xl bg-red-50 p-3 text-red-700">
              {printJob.last_error}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

export type OrderLineItem = {
  id: string | number;
  name: string;
  quantity: number;
  notes: string | null;
  line_total: number | string | null;
};

export function AdminOrderItemsCard({
  items,
  subtotal,
  deliveryFee,
  total,
}: {
  items: OrderLineItem[];
  subtotal: number | string | null;
  deliveryFee: number | string | null;
  total: number | string | null;
}) {
  const { t, locale } = useLocale();
  const { formatMoney: money } = useAdminFormat();

  return (
    <Card>
      <h2 className="font-sans text-2xl font-semibold tracking-tight">
        {t("admin.detail.items")}
      </h2>
      <div className="mt-4 divide-y divide-sage/15">
        {items.map((item) => (
          <div
            key={String(item.id)}
            className="grid grid-cols-[auto_1fr_auto] gap-3 py-4 text-sm"
          >
            <span className="font-bold text-sage-deep">{item.quantity}×</span>
            <div>
              <p className="font-semibold">
                {localizedDishName(item.name, locale)}
              </p>
              {item.notes ? (
                <p className="mt-1 text-xs text-muted">{item.notes}</p>
              ) : null}
            </div>
            <span className="font-semibold">{money(item.line_total)}</span>
          </div>
        ))}
      </div>
      <dl className="ml-auto mt-4 max-w-xs space-y-2 border-t border-sage/20 pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t("admin.detail.subtotal")}</dt>
          <dd>{money(subtotal)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">{t("admin.detail.deliveryFee")}</dt>
          <dd>{money(deliveryFee)}</dd>
        </div>
        <div className="flex justify-between text-lg font-bold">
          <dt>{t("admin.detail.total")}</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function AdminOrderCustomerCard({
  name,
  email,
  phone,
  fulfillmentType,
  address,
  locationUrl,
  notes,
}: {
  name: string | null;
  email: string | null;
  phone: string | null;
  fulfillmentType: string | null;
  address: string;
  locationUrl: string | null;
  notes: string | null;
}) {
  const { t } = useLocale();

  return (
    <Card>
      <h2 className="font-sans text-xl font-semibold tracking-tight">
        {t("admin.detail.customer")}
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className={labelClass}>{t("admin.detail.name")}</dt>
          <dd className="mt-1 font-semibold">{name ?? "–"}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.email")}</dt>
          <dd className="mt-1 break-all">{email ?? "–"}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.phone")}</dt>
          <dd className="mt-1">{phone ?? "–"}</dd>
        </div>
        <div>
          <dt className={labelClass}>{t("admin.detail.orderType")}</dt>
          <dd className="mt-1">
            {fulfillmentType === "delivery"
              ? t("admin.detail.delivery")
              : t("admin.detail.pickup")}
          </dd>
        </div>
        {address ? (
          <div>
            <dt className={labelClass}>{t("admin.detail.address")}</dt>
            <dd className="mt-1">{address}</dd>
          </div>
        ) : null}
        {locationUrl ? (
          <div>
            <dt className={labelClass}>{t("admin.detail.location")}</dt>
            <dd className="mt-1 break-all">
              <a
                href={locationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sage-deep underline-offset-2 hover:underline"
              >
                {locationUrl}
              </a>
            </dd>
          </div>
        ) : null}
        {notes ? (
          <div>
            <dt className={labelClass}>{t("admin.detail.note")}</dt>
            <dd className="mt-1 rounded-xl bg-cream/60 p-3">{notes}</dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}

export function AdminOrderPaymentCard({
  method,
  status,
}: {
  method: string | null;
  status: string | null;
}) {
  const { t } = useLocale();

  return (
    <Card>
      <h2 className="font-sans text-xl font-semibold tracking-tight">
        {t("admin.detail.payment")}
      </h2>
      <dl className="mt-4 space-y-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted">{t("admin.detail.method")}</dt>
          <dd className="font-semibold">
            {method === "card"
              ? "Stripe"
              : method && method !== "cash"
                ? method
                : t("admin.detail.cash")}
          </dd>
        </div>
        {method !== "cash" ? (
          <div className="flex justify-between">
            <dt className="text-muted">{t("admin.detail.paymentStatus")}</dt>
            <dd
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                status === "paid"
                  ? "bg-emerald-100 text-emerald-800"
                  : status === "refunded"
                    ? "bg-slate-100 text-slate-700"
                    : "bg-amber-100 text-amber-900"
              }`}
            >
              {status === "paid"
                ? t("admin.payment.paid")
                : status === "refunded"
                  ? t("admin.payment.refunded")
                  : t("admin.payment.unpaid")}
            </dd>
          </div>
        ) : null}
      </dl>
    </Card>
  );
}
