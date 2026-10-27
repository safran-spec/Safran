import { listDeliveryZones } from "@/backend/services/delivery-zone.service";
import { getRestaurantSettings } from "@/backend/services/settings.service";
import { AdminDeliveryZonesView } from "@/components/admin/admin-delivery-zones-view";
import { getAdminContext } from "@/components/admin/data";

type DeliveryZonesPageProps = {
  searchParams: Promise<{ message?: string; error?: string }>;
};

export default async function DeliveryZonesPage({
  searchParams,
}: DeliveryZonesPageProps) {
  const [params, context] = await Promise.all([searchParams, getAdminContext()]);
  if (context.state !== "ready") return null;

  const [{ zones, error }, restaurant] = await Promise.all([
    listDeliveryZones(),
    getRestaurantSettings(),
  ]);

  const defaultDeliveryMinimum = Number(
    restaurant.settings.delivery_minimum ?? 0,
  );

  return (
    <AdminDeliveryZonesView
      message={params.message}
      error={params.error ?? error ?? undefined}
      defaultDeliveryMinimum={defaultDeliveryMinimum}
      zones={(zones ?? []).map((zone) => ({
        id: Number(zone.id),
        postal_code: String(zone.postal_code),
        minimum_order: Number(zone.minimum_order),
        is_active: Boolean(zone.is_active),
      }))}
    />
  );
}
