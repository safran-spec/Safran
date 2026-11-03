"use client";

import { useMemo, useState } from "react";
import {
  applyMenuDiscountAction,
  clearMenuDiscountAction,
} from "@/app/admin/actions";
import { useAdminFormat } from "@/components/admin/format";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { Card, EmptyState, Notice, PageHeader, fieldClass } from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  localizedCategoryTitle,
  localizedDishName,
} from "@/lib/i18n/menu-text";

const MAX_PERCENT = 99;

export type AdminDiscountCategory = {
  id: number | string;
  title: string;
  subtitle?: string | null;
};

export type AdminDiscountItem = {
  id: number | string;
  category_id: number | string;
  item_number: number | string;
  name: string;
  price: number;
  discount_percent: number;
  is_active: boolean;
};

type AdminDiscountsViewProps = {
  message?: string;
  error?: string;
  categories: AdminDiscountCategory[];
  items: AdminDiscountItem[];
};

/** Mirrors `discountedPrice` on the server so the preview matches the charge. */
function salePrice(price: number, percent: number) {
  const reduced = price * (1 - Math.min(Math.max(percent, 0), MAX_PERCENT) / 100);
  return Math.round(reduced * 100) / 100;
}

function trimPercent(percent: number) {
  return String(Math.round(percent * 100) / 100);
}

export function AdminDiscountsView({
  message,
  error,
  categories,
  items,
}: AdminDiscountsViewProps) {
  const { t, locale } = useLocale();
  const { formatMoney } = useAdminFormat();
  const dishName = (name: string) => localizedDishName(name, locale);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [percentInput, setPercentInput] = useState("10");
  const [query, setQuery] = useState("");

  const percent = Number(percentInput);
  const percentValid =
    Number.isFinite(percent) && percent > 0 && percent <= MAX_PERCENT;

  const groups = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("de-CH");
    const matches = (item: AdminDiscountItem) =>
      !needle ||
      item.name.toLocaleLowerCase("de-CH").includes(needle) ||
      String(item.item_number).includes(needle);

    return categories
      .map((category) => ({
        category,
        items: items.filter(
          (item) =>
            String(item.category_id) === String(category.id) && matches(item),
        ),
      }))
      .filter((group) => group.items.length);
  }, [categories, items, query]);

  const visibleIds = useMemo(
    () => groups.flatMap((group) => group.items.map((item) => String(item.id))),
    [groups],
  );
  const discountedCount = items.filter((item) => item.discount_percent > 0).length;
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleMany = (ids: string[], checked: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  return (
    <>
      <PageHeader
        eyebrow={t("admin.discounts.eyebrow")}
        title={t("admin.discounts.title")}
        description={t("admin.discounts.desc")}
      />
      <Notice message={message} error={error} />

      {items.length ? (
        <form action={applyMenuDiscountAction}>
          <Card className="sticky top-16 z-20 mb-5">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block text-sm font-semibold">
                {t("admin.discounts.percent")}
                <div className="relative">
                  <input
                    className={`${fieldClass} w-32 pr-9`}
                    name="percent"
                    type="number"
                    min={1}
                    max={MAX_PERCENT}
                    step="0.5"
                    inputMode="decimal"
                    value={percentInput}
                    onChange={(event) => setPercentInput(event.target.value)}
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted"
                  >
                    %
                  </span>
                </div>
              </label>

              <PendingSubmitButton
                requireDirty={false}
                mfa
                disabled={!selected.size || !percentValid}
                pendingLabel={t("admin.discounts.applying")}
              >
                {t("admin.discounts.apply")}
              </PendingSubmitButton>

              <PendingSubmitButton
                variant="danger"
                requireDirty={false}
                formAction={clearMenuDiscountAction}
                mfa
                disabled={!selected.size}
                pendingLabel={t("admin.discounts.removing")}
              >
                {t("admin.discounts.remove")}
              </PendingSubmitButton>

              <label className="ml-auto block text-sm font-semibold">
                {t("admin.discounts.search")}
                <input
                  className={`${fieldClass} sm:w-64`}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("admin.discounts.searchPlaceholder")}
                />
              </label>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-ink/6 pt-3 text-sm">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleMany(visibleIds, event.target.checked)}
                />
                {t("admin.discounts.selectAll")}
              </label>
              <p className="text-muted">
                {t("admin.discounts.selectedCount", {
                  count: String(selected.size),
                })}
              </p>
              <p className="text-muted">
                {t("admin.discounts.activeCount", {
                  count: String(discountedCount),
                })}
              </p>
            </div>
          </Card>

          <div className="space-y-5">
            {groups.map(({ category, items: categoryItems }) => {
              const ids = categoryItems.map((item) => String(item.id));
              const allSelected = ids.every((id) => selected.has(id));

              return (
                <Card key={String(category.id)}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-sans text-xl font-semibold tracking-tight">
                      {localizedCategoryTitle(
                        category.title,
                        category.subtitle,
                        locale,
                      )}
                    </h2>
                    <label className="flex items-center gap-2 text-sm font-semibold text-sage-deep">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(event) => toggleMany(ids, event.target.checked)}
                      />
                      {t("admin.discounts.selectCategory")}
                    </label>
                  </div>

                  <ul className="mt-3 divide-y divide-ink/6">
                    {categoryItems.map((item) => {
                      const id = String(item.id);
                      const checked = selected.has(id);
                      const current = item.discount_percent;
                      const preview =
                        checked && percentValid ? salePrice(item.price, percent) : null;

                      return (
                        <li key={id}>
                          <label className="flex cursor-pointer flex-wrap items-center gap-3 py-2.5">
                            <input
                              type="checkbox"
                              name="ids"
                              value={id}
                              checked={checked}
                              onChange={() => toggle(id)}
                            />
                            <span className="w-10 shrink-0 font-mono text-xs text-muted">
                              {String(item.item_number).padStart(2, "0")}.
                            </span>
                            <span className="min-w-0 flex-1 text-sm font-medium text-ink">
                              {dishName(item.name)}
                              {!item.is_active ? (
                                <span className="ml-2 rounded-full bg-ink/8 px-2 py-0.5 text-[11px] font-semibold text-muted">
                                  {t("admin.discounts.hidden")}
                                </span>
                              ) : null}
                            </span>

                            <span className="flex items-center gap-2 text-sm">
                              {current > 0 ? (
                                <>
                                  <span className="text-muted line-through">
                                    {formatMoney(item.price)}
                                  </span>
                                  <span className="font-semibold text-sage-deep">
                                    {formatMoney(salePrice(item.price, current))}
                                  </span>
                                  <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[11px] font-semibold text-ink">
                                    -{trimPercent(current)}%
                                  </span>
                                </>
                              ) : (
                                <span className="font-semibold text-ink">
                                  {formatMoney(item.price)}
                                </span>
                              )}
                              {preview !== null &&
                              preview !== salePrice(item.price, current) ? (
                                <span className="text-xs text-sage-deep">
                                  → {formatMoney(preview)}
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              );
            })}

            {!groups.length ? (
              <EmptyState title={t("admin.discounts.noMatches")}>
                {t("admin.discounts.noMatchesHint")}
              </EmptyState>
            ) : null}
          </div>
        </form>
      ) : (
        <EmptyState title={t("admin.discounts.emptyTitle")}>
          {t("admin.discounts.emptyHint")}
        </EmptyState>
      )}
    </>
  );
}
