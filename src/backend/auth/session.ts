import "server-only";

import { cache } from "react";
import { normalizeRole, type AppRole } from "@/backend/domain/roles";
import {
  createSessionClient,
  getSupabasePublicEnv,
  type SessionClient,
} from "@/backend/supabase/clients";
import type { Actor } from "@/backend/types";

export type SessionContext = {
  supabase: SessionClient;
  /** Null when the visitor is anonymous. Always read from the auth cookie. */
  actor: Actor | null;
  /** True once the session has passed a second factor (Supabase aal2). */
  mfaVerified: boolean;
};

export function hasSupabaseEnvironment(): boolean {
  return getSupabasePublicEnv() !== null;
}

/**
 * Resolves who is calling from the verified auth cookie plus the `profiles`
 * row. The role is never taken from client input, headers or form fields.
 *
 * Memoized with React `cache` so a request that checks authorization several
 * times (layout gate, page gate, then each service call) validates the token and
 * reads the profile once instead of once per check. The memo lives for a single
 * request only, so one user's identity or role can never be served to another.
 */
export const getSessionContext = cache(async (): Promise<SessionContext> => {
  const supabase = await createSessionClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { supabase, actor: null, mfaVerified: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role: AppRole = normalizeRole(profile?.role) ?? "customer";

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  return {
    supabase,
    actor: { userId: user.id, email: user.email, role },
    mfaVerified: aal?.currentLevel === "aal2",
  };
});

/** User id for attaching guest-or-customer orders, without failing when absent. */
export async function getOptionalActor(): Promise<Actor | null> {
  if (!hasSupabaseEnvironment()) return null;
  try {
    const { actor } = await getSessionContext();
    return actor;
  } catch {
    return null;
  }
}
