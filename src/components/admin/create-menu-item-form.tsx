"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  createMenuItemAction,
  type CreateMenuItemState,
} from "@/app/admin/actions";
import { AdminFileInput } from "@/components/admin/admin-file-input";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { Card, Notice, fieldClass } from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";
import { localizedCategoryTitle } from "@/lib/i18n/menu-text";

type CategoryOption = {
  id: number | string;
  title: string;
  subtitle: string | null;
};

type CreateMenuItemFormProps = {
  categories: CategoryOption[];
  nextSortOrder: number;
};

const initialState: CreateMenuItemState = {};

export function CreateMenuItemForm({
  categories,
  nextSortOrder,
}: CreateMenuItemFormProps) {
  const { t, locale } = useLocale();
  const [state, formAction] = useActionState(createMenuItemAction, initialState);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const values = state.values;

  useEffect(() => {
    if (state.error && detailsRef.current) {
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [state.error, state.stamp]);

  const categoryLabel = (category: CategoryOption) =>
    localizedCategoryTitle(category.title, category.subtitle, locale);

  return (
    <Card>
      <details ref={detailsRef} open={Boolean(state.error)}>
        <summary className="cursor-pointer list-none">
          <span className="flex items-center justify-between">
            <span className="font-sans text-xl font-semibold tracking-tight">
              {t("admin.menu.newItem")}
            </span>
            <span className="inline-flex min-h-10 items-center justify-center rounded-xl bg-sage-deep px-4 py-2 text-sm font-semibold text-white">
              {t("admin.menu.add")}
            </span>
          </span>
        </summary>
        <form
          key={state.stamp ?? "create-item"}
          action={formAction}
          className="mt-5 grid gap-3 sm:grid-cols-2"
        >
          {state.error ? (
            <div className="sm:col-span-2">
              <Notice error={state.error} />
            </div>
          ) : null}
          <label className="flex flex-col gap-0 text-sm font-semibold">
            {t("admin.menu.category")}
            <select
              className={fieldClass}
              name="category_id"
              required
              defaultValue={values?.category_id ?? ""}
            >
              <option value="">{t("admin.menu.select")}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold">
            {t("admin.menu.number")}
            <input
              className={fieldClass}
              name="number"
              type="number"
              required
              defaultValue={values?.number ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold sm:col-span-2">
            {t("admin.menu.name")}
            <input
              className={fieldClass}
              name="name"
              required
              defaultValue={values?.name ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold sm:col-span-2">
            {t("admin.menu.descDe")}
            <textarea
              className={fieldClass}
              name="description_de"
              rows={2}
              defaultValue={values?.description_de ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold sm:col-span-2">
            {t("admin.menu.descEn")}
            <textarea
              className={fieldClass}
              name="description_en"
              rows={2}
              defaultValue={values?.description_en ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold">
            {t("admin.menu.priceChf")}
            <input
              className={fieldClass}
              name="price"
              type="number"
              min="0"
              step="0.05"
              required
              defaultValue={values?.price ?? ""}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold">
            {t("admin.menu.position")}
            <input
              className={fieldClass}
              name="sort_order"
              type="number"
              defaultValue={values?.sort_order ?? String(nextSortOrder)}
            />
          </label>
          <label className="flex flex-col gap-0 text-sm font-semibold sm:col-span-2">
            {t("admin.menu.imageHint")}
            <span className="mt-1 text-xs font-normal text-muted">
              {t("admin.menu.imageSpec")}
            </span>
            <AdminFileInput
              className="mt-1.5"
              name="image"
              accept="image/jpeg,image/png,image/webp,image/avif"
            />
            {state.error ? (
              <span className="mt-1 text-xs font-normal text-muted">
                {t("admin.menu.imageReselect")}
              </span>
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              name="is_available"
              type="checkbox"
              defaultChecked={values?.is_available ?? true}
            />{" "}
            {t("admin.menu.available")}
          </label>
          <PendingSubmitButton
            className="sm:col-span-2"
            requireDirty={false}
            pendingLabel={t("admin.menu.creating")}
          >
            {t("admin.menu.createItem")}
          </PendingSubmitButton>
        </form>
      </details>
    </Card>
  );
}
