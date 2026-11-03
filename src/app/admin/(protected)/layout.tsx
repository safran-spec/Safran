import { redirect } from "next/navigation";
import { getStoreOpen } from "@/backend/services/settings.service";
import { getAdminContext } from "@/components/admin/data";
import { AdminShell, SetupState } from "@/components/admin/ui";

export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getAdminContext();
  if (context.state === "setup") return <SetupState />;
  if (context.state === "anonymous" || context.state === "mfa") redirect("/admin/login");
  if (context.state === "forbidden") redirect("/admin/login?error=Admin-Berechtigung%20erforderlich");

  return (
    <AdminShell email={context.email} storeOpen={await getStoreOpen()}>
      {children}
    </AdminShell>
  );
}
