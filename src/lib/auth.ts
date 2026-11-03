import "server-only";

import type { User } from "@supabase/supabase-js";
import { getSessionContext } from "@/backend/auth/session";
import { isBackOfficeRole } from "@/backend/domain/roles";
import { createSessionClient } from "@/backend/supabase/clients";
import type { Profile } from "@/types/database";

/**
 * Compatibility shim over the backend auth layer, kept so the admin check is
 * defined in exactly one place.
 */
export async function getCurrentUser(): Promise<User | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;

  return data;
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const { actor, mfaVerified } = await getSessionContext();
  return isBackOfficeRole(actor?.role ?? null) && mfaVerified;
}
