"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useDirtyForm } from "@/components/admin/dirty-form";
import { MfaCodeDialog } from "@/components/admin/mfa-code-dialog";
import { useLocale } from "@/lib/i18n/locale-context";

type PendingSubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
  /** Visual variant for destructive actions. */
  variant?: "primary" | "secondary" | "danger";
  /**
   * When true (default) and the button sits inside `DirtyForm`, stay disabled
   * until the user changes a field. Set false for actions that should always
   * be available (e.g. remove sound).
   */
  requireDirty?: boolean;
  /** Lets a second button in the same form submit to another Server Action. */
  formAction?: (formData: FormData) => void | Promise<void>;
  /** Associates the button with a form by id when it sits outside that form. */
  form?: string;
  /** Additional reason to block submission, e.g. an empty selection. */
  disabled?: boolean;
  /**
   * Asks for an authenticator code before submitting. The code is sent to the
   * Server Action as `mfa_code`.
   */
  mfa?: boolean;
};


const VARIANT_CLASS: Record<
  NonNullable<PendingSubmitButtonProps["variant"]>,
  string
> = {
  primary:
    "inline-flex min-h-10 items-center justify-center rounded-xl bg-sage-deep px-4 py-2 text-sm font-semibold text-white transition hover:bg-ink focus:outline-none focus:ring-2 focus:ring-sage focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-10 items-center justify-center rounded-xl border border-sage/35 bg-white px-4 py-2 text-sm font-semibold text-sage-deep transition hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50",
  danger:
    "inline-flex min-h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50",
};

/**
 * Submit button that disables and swaps its label while the parent Server Action
 * is pending. Must be rendered inside a React `<form>`.
 */
export function PendingSubmitButton({
  children,
  pendingLabel,
  className = "",
  variant = "primary",
  requireDirty = true,
  formAction,
  form,
  disabled = false,
  mfa = false,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus();
  const dirty = useDirtyForm();
  const { t } = useLocale();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const blockedByDirty =
    requireDirty && dirty !== null && dirty === false;
  const busyLabel = pendingLabel ?? t("admin.common.saving");

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!mfa) return;
    event.preventDefault();
    const owner = event.currentTarget.form;
    if (owner && !owner.reportValidity()) return;
    setCodeOpen(true);
  };

  const submitWithCode = (code: string) => {
    const button = buttonRef.current;
    const owner = button?.form;
    if (!button || !owner) return;
    setCodeOpen(false);
    const hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.name = "mfa_code";
    hidden.value = code;
    owner.appendChild(hidden);
    try {
      owner.requestSubmit(button);
    } finally {
      hidden.remove();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="submit"
        form={form}
        formAction={formAction}
        onClick={mfa ? handleClick : undefined}
        disabled={pending || blockedByDirty || disabled}
        aria-busy={pending}
        className={`${VARIANT_CLASS[variant]} ${className}`.trim()}
      >
        {pending ? busyLabel : children}
      </button>
      {mfa && codeOpen ? (
        <MfaCodeDialog
          onSubmit={submitWithCode}
          onCancel={() => setCodeOpen(false)}
        />
      ) : null}
    </>
  );
}

