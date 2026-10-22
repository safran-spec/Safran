/**
 * Creates (or updates) a back-office admin in the linked Supabase project.
 *
 * Requires in .env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← testing project service_role secret
 *   SUPABASE_ADMIN_EMAIL
 *   SUPABASE_ADMIN_PASSWORD     (falls back to ADMIN_PASSWORD)
 *
 * Usage: npx tsx scripts/create-admin.ts
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const url =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SECRET_KEY ??
  "";
const email = process.env.SUPABASE_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
const password =
  process.env.SUPABASE_ADMIN_PASSWORD?.trim() ||
  process.env.ADMIN_PASSWORD?.trim() ||
  "";

if (!url || !serviceRoleKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (testing project → Settings → API → service_role).",
  );
}
if (!email || !password) {
  throw new Error(
    "Set SUPABASE_ADMIN_EMAIL and SUPABASE_ADMIN_PASSWORD (or ADMIN_PASSWORD).",
  );
}
if (password.length < 8) {
  throw new Error("Admin password must be at least 8 characters.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserIdByEmail(target: string): Promise<string | null> {
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === target,
    );
    if (match) return match.id;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  let userId = await findUserIdByEmail(email);

  if (!userId) {
    const created = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { role: "admin" },
    });
    if (created.error || !created.data.user) {
      throw created.error ?? new Error("createUser returned no user");
    }
    userId = created.data.user.id;
    console.log(`Created Auth user ${email}`);
  } else {
    const updated = await supabase.auth.admin.updateUserById(userId, {
      password,
      email_confirm: true,
    });
    if (updated.error) throw updated.error;
    console.log(`Updated password for existing Auth user ${email}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: userId,
      role: "admin",
      display_name: "Safran Admin",
    },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;

  console.log(`Admin ready → ${email} (role: admin)`);
  console.log(`Login at /admin/login`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
