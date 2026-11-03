import { redirect } from "next/navigation";
import { AdminLoginView } from "@/components/admin/admin-login-view";
import { getAdminContext } from "@/components/admin/data";
import { SetupState } from "@/components/admin/ui";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const [params, context] = await Promise.all([searchParams, getAdminContext()]);
  if (context.state === "ready") redirect("/admin");
  if (context.state === "setup") return <SetupState />;

  return <AdminLoginView error={params.error} next={params.next ?? "/admin"} />;
}
