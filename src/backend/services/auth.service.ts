import "server-only";

import { isBackOfficeRole, normalizeRole } from "@/backend/domain/roles";
import { AuthorizationError, ValidationError } from "@/backend/errors";
import { createSessionClient } from "@/backend/supabase/clients";
import type { Actor } from "@/backend/types";

/**
 * Signs a user into the back office.
 *
 * The role is read from `profiles` after authentication, never from the login
 * form. A user without a back-office role is signed straight back out so no
 * partially privileged session can linger.
 */
export async function signInToBackOffice(input: {
  email: string;
  password: string;
}): Promise<Actor> {
  if (!input.email || !input.password) {
    throw new ValidationError(
      "credentials_required",
      "E-Mail und Passwort sind erforderlich.",
    );
  }

  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });

  if (error || !data.user) {
    throw new AuthorizationError(
      "unauthenticated",
      "Anmeldung fehlgeschlagen. Zugangsdaten prüfen.",
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .maybeSingle();

  const role = normalizeRole(profile?.role);
  if (!isBackOfficeRole(role)) {
    await supabase.auth.signOut();
    throw new AuthorizationError(
      "forbidden",
      "Für dieses Konto fehlt die Admin-Berechtigung.",
    );
  }

  return { userId: data.user.id, email: data.user.email, role: role! };
}

export async function signOut(): Promise<void> {
  const supabase = await createSessionClient();
  await supabase.auth.signOut();
}

export type MfaChallenge =
  | { enrolled: true; factorId: string }
  | { enrolled: false; factorId: string; qrCode: string; secret: string };

/**
 * Returns the verified authenticator for the signed-in user, or starts a new
 * enrollment (QR code + secret) when none exists. Stale unverified factors are
 * dropped first so abandoned setups never pile up.
 */
export async function getMfaChallenge(): Promise<MfaChallenge> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) {
    throw new AuthorizationError("unauthenticated", "Bitte melden Sie sich an.");
  }

  const verified = data.totp[0];
  if (verified) return { enrolled: true, factorId: verified.id };

  const stale = data.all.filter(
    (f) => f.factor_type === "totp" && f.status === "unverified",
  );
  for (const factor of stale) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id });
  }

  const { data: enrolled, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Safran Admin",
  });
  if (enrollError || !enrolled) {
    throw new ValidationError(
      "mfa_enroll_failed",
      "Authenticator konnte nicht eingerichtet werden.",
    );
  }

  return {
    enrolled: false,
    factorId: enrolled.id,
    qrCode: enrolled.totp.qr_code,
    secret: enrolled.totp.secret,
  };
}

/** Verifies a 6-digit code; success upgrades the session to aal2. */
export async function verifyMfaCode(input: {
  factorId: string;
  code: string;
}): Promise<void> {
  if (!/^\d{6}$/.test(input.code) || !input.factorId) {
    throw new ValidationError("mfa_invalid_code", "Ungültiger Code.");
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: input.factorId,
    code: input.code,
  });
  if (error) {
    throw new ValidationError("mfa_invalid_code", "Ungültiger Code.");
  }
}
