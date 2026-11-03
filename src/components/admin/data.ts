import "server-only";

import { getSessionContext, hasSupabaseEnvironment } from "@/backend/auth/session";
import { isBackOfficeRole } from "@/backend/domain/roles";
import type { AppRole } from "@/backend/types";

export type AdminContext =
  | { state: "setup" }
  | { state: "anonymous" }
  | { state: "forbidden" }
  | { state: "ready"; email?: string; role: AppRole };

export { hasSupabaseEnvironment };

/**
 * Render gate for the admin area. It reports why access is denied so the layout
 * can show the setup screen or bounce to login, while pages can bail out
 * quietly during the parallel render.
 *
 * This is not the security boundary: every privileged read and write goes
 * through `requireCapability` in the backend layer and through RLS.
 */
export async function getAdminContext(): Promise<AdminContext> {
  if (!hasSupabaseEnvironment()) return { state: "setup" };

  try {
    const { actor } = await getSessionContext();
    if (!actor) return { state: "anonymous" };
    if (!isBackOfficeRole(actor.role)) return { state: "forbidden" };

    return { state: "ready", email: actor.email, role: actor.role };
  } catch {
    return { state: "setup" };
  }
}

/*
 * Labels, money and date formatting live in the client views so they follow the
 * chosen language; status colours live in `status-styles.ts`. Keep this module
 * free of anything a client component might want, since `server-only` above
 * breaks the build the moment one imports it.
 */
