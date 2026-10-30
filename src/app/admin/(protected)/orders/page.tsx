import { listOrdersForBackOffice } from "@/backend/services/order.service";
import { AdminOrdersView } from "@/components/admin/admin-orders-view";
import { getAdminContext } from "@/components/admin/data";
import { OrdersToolbar } from "@/components/admin/orders-toolbar";

type OrdersPageProps = {
  searchParams: Promise<{
    status?: string;
    q?: string;
    message?: string;
    error?: string;
    page?: string;
  }>;
};

const PAGE_SIZE = 30;

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const [params, context] = await Promise.all([searchParams, getAdminContext()]);
  if (context.state !== "ready") return null;
  const page = Math.max(1, Number(params.page) || 1);

  const { data: orders, count, error, printJobsByOrderId } =
    await listOrdersForBackOffice({
      status: params.status,
      search: params.q,
      page,
      pageSize: PAGE_SIZE,
    });
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  const printJobs: Record<string, { status: string } | undefined> = {};
  for (const [id, job] of printJobsByOrderId.entries()) {
    printJobs[id] = job ? { status: job.status } : undefined;
  }

  return (
    <>
      <OrdersToolbar q={params.q} status={params.status} />
      <AdminOrdersView
        orders={(orders ?? []).map((order) => ({
          id: order.id,
          order_number: order.order_number,
          customer_name: order.customer_name,
          fulfillment_type: order.fulfillment_type,
          created_at: order.created_at,
          status: order.status,
          payment_method: order.payment_method,
          payment_status: order.payment_status,
          total: order.total,
        }))}
        count={count ?? 0}
        page={page}
        pages={pages}
        q={params.q}
        status={params.status}
        message={params.message}
        error={params.error ?? error?.message}
        printJobsByOrderId={printJobs}
      />
    </>
  );
}
