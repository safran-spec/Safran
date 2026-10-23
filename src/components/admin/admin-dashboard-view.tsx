"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DashboardRangeFilter } from "@/components/admin/dashboard-range-filter";
import { useAdminFormat } from "@/components/admin/format";
import { OrderStatusBadge } from "@/components/admin/t";
import {
  Card,
  EmptyState,
  Notice,
  PageHeader,
  secondaryButtonClass,
} from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";

export type DashboardOrder = {
  id: string;
  order_number: number | string | null;
  customer_name: string | null;
  created_at: string;
  status: string;
  total: number | string | null;
};

export type DashboardKpis = {
  totalRevenue: number;
  cashRevenue: number;
  cashCount: number;
  onlineRevenue: number;
  onlineCount: number;
  transactions: number;
  cancelled: number;
  inProgress: number;
  pending: number;
  preparing: number;
  confirmed: number;
  ready: number;
  outForDelivery: number;
  completed: number;
};

function IconWrap({
  children,
  className,
}: {
  children: ReactNode;
  className: string;
}) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${className}`}
    >
      {children}
    </span>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  href?: string;
  icon: ReactNode;
}) {
  const body = (
    <Card className="h-full transition hover:border-sage/25">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted">{label}</p>
          <p className="mt-2 font-sans text-3xl font-semibold tracking-tight tabular-nums text-ink">
            {value}
          </p>
          <p className="mt-1 text-xs text-muted">{hint}</p>
        </div>
        {icon}
      </div>
    </Card>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block">
      {body}
    </Link>
  );
}

export function AdminDashboardView({
  acceptsOrders,
  recentOrders,
  kpis,
  range,
  today,
  message,
  error,
}: {
  acceptsOrders: boolean;
  recentOrders: DashboardOrder[];
  kpis: DashboardKpis;
  range: { from: string; to: string };
  today: string;
  message?: string;
  error?: string;
}) {
  const { t } = useLocale();
  const { formatMoney, formatDateTime, formatDate } = useAdminFormat();
  const rangeRevenue =
    Number.isFinite(kpis.totalRevenue)
      ? kpis.totalRevenue
      : kpis.cashRevenue + kpis.onlineRevenue;
  const day = (key: string) => formatDate(`${key}T12:00:00Z`);
  const rangeLabel =
    range.from === range.to
      ? day(range.from)
      : `${day(range.from)} – ${day(range.to)}`;

  return (
    <>
      <PageHeader
        title={t("admin.dash.title")}
        description={t("admin.dash.desc", { range: rangeLabel })}
        action={
          <Link href="/admin/orders" className={secondaryButtonClass}>
            {t("admin.dash.allOrders")}
          </Link>
        }
      />
      <Notice message={message} error={error} />

      <DashboardRangeFilter
        from={range.from}
        to={range.to}
        today={today}
      />

      {/* Row 1: order counts */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t("admin.dash.orders")}
          value={kpis.transactions}
          hint={
            acceptsOrders
              ? t("admin.dash.accepting")
              : t("admin.dash.paused")
          }
          href="/admin/orders"
          icon={
            <IconWrap className="bg-sky-50 text-sky-700">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M6 7h15l-1.5 9h-12L6 7Zm0 0L5 4H2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
        <KpiCard
          label={t("admin.dash.cancelled")}
          value={kpis.cancelled}
          hint={t("admin.dash.cancelledHint")}
          href="/admin/orders?status=cancelled"
          icon={
            <IconWrap className="bg-red-50 text-red-700">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
              </svg>
            </IconWrap>
          }
        />
        <KpiCard
          label={t("admin.dash.active")}
          value={kpis.inProgress}
          hint={t("admin.dash.ofToday", { n: kpis.transactions })}
          href="/admin/orders?status=pending"
          icon={
            <IconWrap className="bg-amber-50 text-amber-700">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M16 11a4 4 0 1 0-8 0M4 20a6 6 0 0 1 16 0M18 8a3 3 0 1 0 0-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
      </div>

      {/* Row 2: money — total / COD / Stripe */}
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t("admin.dash.paymentsAll")}
          value={formatMoney(rangeRevenue)}
          hint={t("admin.dash.paymentsAllHint", {
            n: kpis.transactions,
          })}
          icon={
            <IconWrap className="bg-emerald-50 text-emerald-700">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
        <KpiCard
          label={t("admin.dash.cash")}
          value={formatMoney(kpis.cashRevenue)}
          hint={t("admin.dash.cashHint", { n: kpis.cashCount })}
          icon={
            <IconWrap className="bg-amber-50 text-amber-800">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M12 3v18M7 8h7a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
        <KpiCard
          label={t("admin.dash.online")}
          value={formatMoney(kpis.onlineRevenue)}
          hint={t("admin.dash.onlineHint", { n: kpis.onlineCount })}
          icon={
            <IconWrap className="bg-sky-50 text-sky-800">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Zm2-4h14l1 4H4l1-4Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
      </div>

      <div className="mt-4">
        <KpiCard
          label={t("admin.dash.completed")}
          value={kpis.completed}
          hint={t("admin.dash.completedHint")}
          href="/admin/orders?status=completed"
          icon={
            <IconWrap className="bg-emerald-50 text-emerald-700">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  d="m8.5 12.5 2.5 2.5 4.5-5M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </IconWrap>
          }
        />
      </div>

      <Card className="mt-4">
        <div className="mb-5 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-sans text-2xl font-semibold tracking-tight text-ink">
              {t("admin.dash.recent")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("admin.dash.recentHint")}
            </p>
          </div>
          <Link
            href="/admin/orders"
            className="text-sm font-semibold text-sage-deep hover:underline"
          >
            {t("admin.dash.viewAll")}
          </Link>
        </div>
        {!recentOrders.length ? (
          <EmptyState title={t("admin.dash.emptyTitle")}>
            {t("admin.dash.emptyBody")}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b border-ink/8 text-xs tracking-wider text-muted uppercase">
                <tr>
                  <th className="pb-3 font-semibold">
                    {t("admin.dash.colOrder")}
                  </th>
                  <th className="pb-3 font-semibold">
                    {t("admin.dash.colCustomer")}
                  </th>
                  <th className="pb-3 font-semibold">
                    {t("admin.dash.colTime")}
                  </th>
                  <th className="pb-3 font-semibold">
                    {t("admin.dash.colStatus")}
                  </th>
                  <th className="pb-3 text-right font-semibold">
                    {t("admin.dash.colTotal")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/6">
                {recentOrders.map((order) => (
                  <tr key={order.id} className="transition hover:bg-[#faf7f2]">
                    <td className="py-3.5 font-semibold">
                      <Link
                        className="hover:text-sage-deep hover:underline"
                        href={`/admin/orders/${order.id}`}
                      >
                        #
                        {order.order_number ?? String(order.id).slice(0, 8)}
                      </Link>
                    </td>
                    <td className="py-3.5">
                      {order.customer_name ?? t("admin.dash.guest")}
                    </td>
                    <td className="py-3.5 text-muted">
                      {formatDateTime(order.created_at)}
                    </td>
                    <td className="py-3.5">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="py-3.5 text-right font-semibold">
                      {formatMoney(order.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
