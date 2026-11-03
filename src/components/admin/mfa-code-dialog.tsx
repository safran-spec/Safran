"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  fieldClass,
  secondaryButtonClass,
} from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";

type MfaCodeDialogProps = {
  onSubmit: (code: string) => void;
  onCancel: () => void;
};

/**
 * Asks for a fresh authenticator code before a sensitive action. Rendered in a
 * portal so it never becomes part of the surrounding form.
 */
export function MfaCodeDialog({ onSubmit, onCancel }: MfaCodeDialogProps) {
  const { t } = useLocale();
  const [code, setCode] = useState("");
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const confirm = () => {
    const normalized = code.replace(/\s/g, "");
    if (!/^\d{6}$/.test(normalized)) {
      setInvalid(true);
      return;
    }
    onSubmit(normalized);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("admin.mfa.cancelShort")}
        onClick={onCancel}
        className="absolute inset-0 bg-ink/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mfa-code-dialog-title"
        className="relative w-full max-w-sm rounded-2xl bg-white p-5 text-left shadow-xl sm:p-6"
      >
        <h2
          id="mfa-code-dialog-title"
          className="font-sans text-lg font-semibold tracking-tight text-ink"
        >
          {t("admin.mfa.gate.title")}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{t("admin.mfa.gate.desc")}</p>
        <label className="mt-4 block text-sm font-semibold text-ink">
          {t("admin.mfa.code")}
          <input
            ref={inputRef}
            className={fieldClass}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123456"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setInvalid(false);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                confirm();
              }
            }}
          />
        </label>
        {invalid ? (
          <p className="mt-2 text-sm text-red-700">{t("admin.mfa.gate.invalid")}</p>
        ) : null}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className={secondaryButtonClass}>
            {t("admin.mfa.cancelShort")}
          </button>
          <button
            type="button"
            onClick={confirm}
            className="inline-flex min-h-10 items-center justify-center rounded-xl bg-sage-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink"
          >
            {t("admin.mfa.gate.submit")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
