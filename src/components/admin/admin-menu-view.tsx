"use client";

import { CreateMenuItemForm } from "@/components/admin/create-menu-item-form";
import { MenuPdfDownload } from "@/components/admin/menu-pdf-download";
import { AdminFileInput } from "@/components/admin/admin-file-input";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  Card,
  EmptyState,
  Notice,
  PageHeader,
  fieldClass,
} from "@/components/admin/ui";
import {
  createCategoryAction,
  deleteCategoryAction,
  deleteMenuItemAction,
  replaceMenuItemImageAction,
  setMenuItemAvailabilityAction,
  updateCategoryAction,
  updateMenuItemAction,
} from "@/app/admin/actions";
import { useAdminFormat } from "@/components/admin/format";
import { useLocale } from "@/lib/i18n/locale-context";
import {
  localizedCategoryTitle,
  localizedDishName,
} from "@/lib/i18n/menu-text";

export type AdminMenuCategory = {
  id: number | string;
  title: string;
  subtitle: string | null;
  sort_order: number;
  is_active: boolean;
};

export type AdminMenuItem = {
  id: number | string;
  category_id: number | string;
  item_number: number | string;
  name: string;
  description_de: string | null;
  description_en: string | null;
  price: number;
  sort_order: number;
  is_active: boolean;
  imageUrl: string | null;
};

type AdminMenuViewProps = {
  message?: string;
  error?: string;
  pdfRevision: string;
  categories: AdminMenuCategory[];
  items: AdminMenuItem[];
};

export function AdminMenuView({
  message,
  error,
  pdfRevision,
  categories,
  items,
}: AdminMenuViewProps) {
  const { t, locale } = useLocale();
  const { formatMoney } = useAdminFormat();
  // Headings and list labels follow the admin language; the edit fields below
  // keep the raw database values so saving never rewrites a name.
  const categoryLabel = (category: AdminMenuCategory) =>
    localizedCategoryTitle(category.title, category.subtitle, locale);

  return (
    <>
      <PageHeader
        eyebrow={t("admin.menu.eyebrow")}
        title={t("admin.menu.title")}
        description={t("admin.menu.desc")}
      />
      <Notice message={message} error={error} />

      <Card className="mb-5">
        <h2 className="font-sans text-xl font-semibold tracking-tight">
          {t("admin.menu.pdfTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("admin.menu.pdfDesc")}</p>
        <div className="mt-4">
          <MenuPdfDownload revision={pdfRevision} />
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <h2 className="font-sans text-xl font-semibold tracking-tight">
              {t("admin.menu.newCategory")}
            </h2>
            <form action={createCategoryAction} className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">
                {t("admin.menu.name")}
                <input className={fieldClass} name="name" required />
              </label>
              <label className="block text-sm font-semibold">
                {t("admin.menu.description")}
                <input className={fieldClass} name="description" />
              </label>
              <label className="block text-sm font-semibold">
                {t("admin.menu.position")}
                <input
                  className={fieldClass}
                  name="sort_order"
                  type="number"
                  defaultValue={categories.length}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_active" type="checkbox" defaultChecked />{" "}
                {t("admin.menu.visibleInShop")}
              </label>
              <PendingSubmitButton
                className="w-full"
                pendingLabel={t("admin.menu.creating")}
              >
                {t("admin.menu.createCategory")}
              </PendingSubmitButton>
            </form>
          </Card>

          <Card>
            <h2 className="font-sans text-xl font-semibold tracking-tight">
              {t("admin.menu.categories")}
            </h2>
            {!categories.length ? (
              <div className="mt-4">
                <EmptyState title={t("admin.menu.noCategoriesTitle")}>
                  {t("admin.menu.noCategoriesBody")}
                </EmptyState>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {categories.map((category) => (
                  <details
                    key={category.id}
                    className="rounded-xl border border-sage/20 bg-white"
                  >
                    <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
                      <span className="flex items-center justify-between gap-2">
                        <span>
                          {category.sort_order}. {categoryLabel(category)}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] ${
                            category.is_active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {category.is_active
                            ? t("admin.menu.visible")
                            : t("admin.menu.hidden")}
                        </span>
                      </span>
                    </summary>
                    <div className="border-t border-sage/15 p-3">
                      <form action={updateCategoryAction} className="space-y-2">
                        <input type="hidden" name="id" value={category.id} />
                        <input
                          className={fieldClass}
                          name="name"
                          defaultValue={category.title}
                          required
                          aria-label={t("admin.menu.name")}
                        />
                        <input
                          className={fieldClass}
                          name="description"
                          defaultValue={category.subtitle ?? ""}
                          aria-label={t("admin.menu.description")}
                        />
                        <input
                          className={fieldClass}
                          name="sort_order"
                          type="number"
                          defaultValue={category.sort_order}
                          aria-label={t("admin.menu.position")}
                        />
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            name="is_active"
                            type="checkbox"
                            defaultChecked={category.is_active}
                          />{" "}
                          {t("admin.menu.visibleInShop")}
                        </label>
                        <PendingSubmitButton
                          className="w-full"
                          pendingLabel={t("admin.common.saving")}
                        >
                          {t("admin.menu.save")}
                        </PendingSubmitButton>
                      </form>
                      <form action={deleteCategoryAction} className="mt-2">
                        <input type="hidden" name="id" value={category.id} />
                        <PendingSubmitButton
                          variant="danger"
                          className="w-full"
                          pendingLabel={t("admin.menu.deleting")}
                        >
                          {t("admin.menu.deleteEmptyCategory")}
                        </PendingSubmitButton>
                      </form>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <CreateMenuItemForm
            categories={categories}
            nextSortOrder={items.length}
          />

          {!categories.length || !items.length ? (
            <Card>
              <EmptyState title={t("admin.menu.noItemsTitle")}>
                {t("admin.menu.noItemsBody")}
              </EmptyState>
            </Card>
          ) : (
            categories.map((category) => {
              const categoryItems = items.filter(
                (item) => item.category_id === category.id,
              );
              if (!categoryItems.length) return null;
              return (
                <Card key={category.id}>
                  <div className="mb-4">
                    <h2 className="font-sans text-2xl font-semibold tracking-tight">
                      {categoryLabel(category)}
                    </h2>
                    <p className="text-sm text-muted">
                      {t("admin.menu.itemCount", { n: categoryItems.length })}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {categoryItems.map((item) => (
                      <details
                        key={item.id}
                        className="overflow-hidden rounded-xl border border-sage/20 bg-white"
                      >
                        <summary className="cursor-pointer list-none p-3">
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              className="h-14 w-14 shrink-0 rounded-lg bg-cream bg-cover bg-center"
                              style={
                                item.imageUrl
                                  ? {
                                      backgroundImage: `url("${item.imageUrl.replace(/"/g, "%22")}")`,
                                    }
                                  : undefined
                              }
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {item.item_number}.{" "}
                                {localizedDishName(item.name, locale)}
                              </span>
                              <span className="mt-1 block text-xs text-muted">
                                {formatMoney(item.price)} ·{" "}
                                {t("admin.menu.position")} {item.sort_order}
                              </span>
                            </span>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                item.is_active
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              {item.is_active
                                ? t("admin.menu.availableBadge")
                                : t("admin.menu.soldOutBadge")}
                            </span>
                          </span>
                        </summary>
                        <div className="border-t border-sage/15 p-4">
                          <form
                            action={setMenuItemAvailabilityAction}
                            className="mb-4"
                          >
                            <input type="hidden" name="id" value={item.id} />
                            <input
                              type="hidden"
                              name="is_available"
                              value={item.is_active ? "false" : "true"}
                            />
                            <PendingSubmitButton
                              variant="secondary"
                              pendingLabel={t("admin.menu.updating")}
                            >
                              {item.is_active
                                ? t("admin.menu.markSoldOut")
                                : t("admin.menu.markAvailable")}
                            </PendingSubmitButton>
                          </form>
                          <form
                            action={updateMenuItemAction}
                            className="grid gap-3 sm:grid-cols-2"
                          >
                            <input type="hidden" name="id" value={item.id} />
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted">
                              {t("admin.menu.category")}
                              <select
                                className={fieldClass}
                                name="category_id"
                                defaultValue={item.category_id}
                              >
                                {categories.map((option) => (
                                  <option key={option.id} value={option.id}>
                                    {option.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted">
                              {t("admin.menu.number")}
                              <input
                                className={fieldClass}
                                name="number"
                                type="number"
                                defaultValue={item.item_number}
                              />
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted sm:col-span-2">
                              {t("admin.menu.name")}
                              <input
                                className={fieldClass}
                                name="name"
                                defaultValue={item.name}
                                required
                              />
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted sm:col-span-2">
                              {t("admin.menu.descDe")}
                              <textarea
                                className={fieldClass}
                                name="description_de"
                                defaultValue={item.description_de ?? ""}
                                rows={2}
                              />
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted sm:col-span-2">
                              {t("admin.menu.descEn")}
                              <textarea
                                className={fieldClass}
                                name="description_en"
                                defaultValue={item.description_en ?? ""}
                                rows={2}
                              />
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted">
                              {t("admin.menu.price")}
                              <input
                                className={fieldClass}
                                name="price"
                                type="number"
                                min="0"
                                step="0.05"
                                defaultValue={item.price}
                              />
                            </label>
                            <label className="flex flex-col gap-0 text-xs font-semibold text-muted">
                              {t("admin.menu.position")}
                              <input
                                className={fieldClass}
                                name="sort_order"
                                type="number"
                                defaultValue={item.sort_order}
                              />
                            </label>
                            <label className="flex items-center gap-2 text-xs">
                              <input
                                name="is_available"
                                type="checkbox"
                                defaultChecked={item.is_active}
                              />{" "}
                              {t("admin.menu.available")}
                            </label>
                            <PendingSubmitButton
                              className="sm:col-span-2"
                              pendingLabel={t("admin.common.saving")}
                            >
                              {t("admin.menu.saveChanges")}
                            </PendingSubmitButton>
                          </form>
                          <div className="mt-4">
                            <p className="text-xs text-muted">
                              {t("admin.menu.imageSpec")}
                            </p>
                            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                              <form
                                action={replaceMenuItemImageAction}
                                className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center"
                              >
                                <input type="hidden" name="id" value={item.id} />
                                <AdminFileInput
                                  name="image"
                                  accept="image/jpeg,image/png,image/webp,image/avif"
                                  required
                                />
                                <PendingSubmitButton
                                  variant="secondary"
                                  className="shrink-0 whitespace-nowrap"
                                  pendingLabel={t("admin.menu.compressing")}
                                >
                                  {t("admin.menu.replaceImage")}
                                </PendingSubmitButton>
                              </form>
                              <form
                                action={deleteMenuItemAction}
                                className="shrink-0"
                              >
                                <input type="hidden" name="id" value={item.id} />
                                <PendingSubmitButton
                                  variant="danger"
                                  className="w-full whitespace-nowrap sm:w-auto"
                                  pendingLabel={t("admin.menu.deleting")}
                                >
                                  {t("admin.menu.delete")}
                                </PendingSubmitButton>
                              </form>
                            </div>
                          </div>
                        </div>
                      </details>
                    ))}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
