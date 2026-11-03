import { listMenu } from "@/backend/services/menu.service";
import { warmMenuPdfAssets } from "@/backend/services/menu-pdf.service";
import { AdminMenuView } from "@/components/admin/admin-menu-view";
import { getAdminContext } from "@/components/admin/data";

type MenuPageProps = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

export default async function MenuAdminPage({ searchParams }: MenuPageProps) {
  const [params, context] = await Promise.all([searchParams, getAdminContext()]);
  if (context.state !== "ready") return null;
  const { categories, items, error } = await listMenu();
  // Warm cover/blank templates in the background so the first PDF click is faster.
  void warmMenuPdfAssets().catch(() => undefined);
  const pdfRevision = [
    categories?.length ?? 0,
    items?.length ?? 0,
    ...(items ?? []).map(
      (item) =>
        `${item.id}:${item.price}:${item.sort_order}:${item.is_active ? 1 : 0}:${item.image_path ?? ""}:${item.name}:${item.description_de ?? ""}:${item.description_en ?? ""}`,
    ),
    ...(categories ?? []).map(
      (category) =>
        `${category.id}:${category.sort_order}:${category.is_active ? 1 : 0}:${category.title}:${category.subtitle ?? ""}`,
    ),
  ].join("|");

  return (
    <AdminMenuView
      message={params.message}
      error={params.error ?? error ?? undefined}
      pdfRevision={pdfRevision}
      categories={(categories ?? []).map((category) => ({
        id: category.id,
        title: category.title,
        subtitle: category.subtitle,
        sort_order: category.sort_order,
        is_active: category.is_active,
      }))}
      items={(items ?? []).map((item) => ({
        id: item.id,
        category_id: item.category_id,
        item_number: item.item_number,
        name: item.name,
        description_de: item.description_de,
        description_en: item.description_en,
        price: Number(item.price),
        sort_order: item.sort_order,
        is_active: item.is_active,
        imageUrl: item.imageUrl,
      }))}
    />
  );
}
