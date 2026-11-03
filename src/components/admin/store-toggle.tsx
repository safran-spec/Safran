"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { setStoreOpenAction } from "@/app/admin/actions";
import { useLocale } from "@/lib/i18n/locale-context";

function ToggleButton({
  open,
  onRequestClose,
}: {
  open: boolean;
  onRequestClose: () => void;
}) {
  const { pending } = useFormStatus();
  const { t } = useLocale();

  return (
    <button
      type={open ? "button" : "submit"}
      onClick={open ? onRequestClose : undefined}
      disabled={pending}
      aria-pressed={!open}
      aria-label={open ? t("admin.storeClose") : t("admin.storeOpenAction")}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60 ${
        open ? "bg-emerald-500" : "bg-red-500"
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
          open ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function AdminStoreToggle({ open }: { open: boolean }) {
  const pathname = usePathname();
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);

  return (
    <form
      action={setStoreOpenAction}
      className="relative flex items-center gap-2 rounded-full border border-ink/8 bg-white px-2.5 py-1.5 shadow-sm sm:gap-2.5 sm:px-3"
    >
      <input type="hidden" name="is_open" value={open ? "false" : "true"} />
      <input type="hidden" name="next" value={pathname || "/admin"} />
      <p className="hidden text-xs font-semibold text-ink sm:block">
        {open ? t("admin.storeOpen") : t("admin.storeClosed")}
      </p>
      <ToggleButton open={open} onRequestClose={() => setConfirming(true)} />
      {open && confirming && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border border-ink/10 bg-white p-3 shadow-lg">
          <p className="text-xs font-semibold text-ink">
            {t("admin.storeClose.confirm")}
          </p>
          <input
            className="mt-2 w-full rounded-lg border border-ink/15 px-3 py-2 text-sm"
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
          <div className="mt-2 flex gap-2">
            <button
              type="submit"
              className="flex-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {t("admin.storeClose.submit")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-ink/15 px-3 py-1.5 text-xs"
            >
              {t("admin.mfa.cancelShort")}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
