import { redirect } from "next/navigation";
import { getMfaChallenge } from "@/backend/services/auth.service";
import { AdminLoginView } from "@/components/admin/admin-login-view";
import { AdminMfaView } from "@/components/admin/admin-mfa-view";
import { getAdminContext } from "@/components/admin/data";
import { SetupState } from "@/components/admin/ui";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function AdminLoginPage({ searchParams }: LoginPageProps) {
  const [params, context] = await Promise.all([searchParams, getAdminContext()]);
  const next =
    params.next?.startsWith("/admin") && !params.next.startsWith("//")
      ? params.next
      : "/admin";
  if (context.state === "ready") redirect(next);
  if (context.state === "setup") return <SetupState />;
  if (context.state === "mfa") {
    return (
      <AdminMfaView
        challenge={await getMfaChallenge()}
        error={params.error}
        next={next}
      />
    );
  }

  return <AdminLoginView error={params.error} next={next} />;
}
