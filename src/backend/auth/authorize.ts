import "server-only";

import { can, isBackOfficeRole, type Capability } from "@/backend/domain/roles";
import { AuthorizationError } from "@/backend/errors";
import { getSessionContext, type SessionContext } from "@/backend/auth/session";
import type { Actor } from "@/backend/types";

export type AuthorizedContext = SessionContext & { actor: Actor };

/** Back-office roles must have completed the authenticator (TOTP) step. */
function requireMfa(context: SessionContext) {
  if (context.actor && isBackOfficeRole(context.actor.role) && !context.mfaVerified) {
    throw new AuthorizationError(
      "unauthenticated",
      "Zwei-Faktor-Bestätigung erforderlich.",
    );
  }
}

/**
 * Server-side gate for every privileged operation. Throws instead of returning
 * a boolean so a forgotten check cannot silently pass.
 *
 * RLS still enforces the same rules in Postgres; this layer produces useful
 * errors and keeps the rules readable in one place.
 */
export async function requireCapability(
  capability: Capability,
): Promise<AuthorizedContext> {
  const context = await getSessionContext();

  if (!context.actor) {
    throw new AuthorizationError(
      "unauthenticated",
      "Bitte melden Sie sich an.",
    );
  }
  if (!can(context.actor.role, capability)) {
    throw new AuthorizationError(
      "forbidden",
      "Für diese Aktion fehlt die Berechtigung.",
    );
  }
  requireMfa(context);

  return { ...context, actor: context.actor };
}

/** Read access to the back office (admin site shell and its pages). */
export async function requireBackOffice(): Promise<AuthorizedContext> {
  const context = await getSessionContext();

  if (!context.actor) {
    throw new AuthorizationError("unauthenticated", "Bitte melden Sie sich an.");
  }
  if (!isBackOfficeRole(context.actor.role)) {
    throw new AuthorizationError(
      "forbidden",
      "Für dieses Konto fehlt die Admin-Berechtigung.",
    );
  }
  requireMfa(context);

  return { ...context, actor: context.actor };
}
