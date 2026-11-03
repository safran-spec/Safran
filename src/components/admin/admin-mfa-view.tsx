"use client";

import { logoutAction, verifyMfaAction } from "@/app/admin/actions";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import { Card, Notice, fieldClass } from "@/components/admin/ui";
import { LanguageToggle } from "@/components/language-toggle";
import { useLocale } from "@/lib/i18n/locale-context";

type Challenge =
  | { enrolled: true; factorId: string }
  | { enrolled: false; factorId: string; qrCode: string; secret: string };

export function AdminMfaView({
  challenge,
  error,
  next,
}: {
  challenge: Challenge;
  error?: string;
  next: string;
}) {
  const { t } = useLocale();

  return (
    <div
      className="notranslate min-h-screen bg-[#f3ede4] px-4 py-36"
      translate="no"
    >
      <div className="mx-auto max-w-md">
        <div className="mb-7 text-center">
          <p className="font-serif text-4xl text-sage-deep">Safran</p>
          <div className="mt-4 flex justify-center">
            <LanguageToggle variant="admin" />
          </div>
        </div>
        <Card>
          <h1 className="font-sans text-2xl font-semibold tracking-tight">
            {t("admin.mfa.title")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted">
            {challenge.enrolled ? t("admin.mfa.descVerify") : t("admin.mfa.descSetup")}
          </p>
          <div className="mt-5">
            <Notice error={error} />
          </div>
          {!challenge.enrolled && (
            <div className="mt-2 flex flex-col items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={challenge.qrCode}
                alt={t("admin.mfa.qrAlt")}
                width={192}
                height={192}
              />
              <p className="text-xs text-muted">{t("admin.mfa.manual")}</p>
              <code className="break-all rounded bg-black/5 px-2 py-1 text-xs">
                {challenge.secret}
              </code>
            </div>
          )}
          <form action={verifyMfaAction} className="mt-5 space-y-5">
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="factorId" value={challenge.factorId} />
            <label className="block text-sm font-semibold text-ink">
              {t("admin.mfa.code")}
              <input
                className={fieldClass}
                type="text"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                autoFocus
                placeholder="123456"
              />
            </label>
            <PendingSubmitButton
              className="w-full"
              pendingLabel={t("admin.mfa.verifying")}
            >
              {t("admin.mfa.submit")}
            </PendingSubmitButton>
          </form>
          <form action={logoutAction} className="mt-4 text-center">
            <button type="submit" className="text-xs text-muted underline">
              {t("admin.mfa.cancel")}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
