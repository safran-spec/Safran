"use client";

import {
  createDeliveryZoneAction,
  deleteDeliveryZoneAction,
  updateDefaultDeliveryMinimumAction,
  updateDeliveryZoneAction,
} from "@/app/admin/actions";
import { ConfirmSubmitButton } from "@/components/admin/confirm-submit-button";
import { DirtyForm, DirtyOnly } from "@/components/admin/dirty-form";
import { useAdminFormat } from "@/components/admin/format";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  Card,
  Notice,
  PageHeader,
  fieldClass,
} from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";

export type AdminDeliveryZone = {
  id: number;
  postal_code: string;
  minimum_order: number;
  is_active: boolean;
};

type AdminDeliveryZonesViewProps = {
  message?: string;
  error?: string;
  zones: AdminDeliveryZone[];
  defaultDeliveryMinimum: number;
};

const inputClass =
  "box-border h-10 w-[5.5rem] shrink-0 rounded-xl border border-sage/40 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-sage-deep focus:ring-2 focus:ring-sage/20";

const minInputClass =
  "box-border h-10 w-[7rem] shrink-0 rounded-xl border border-sage/40 bg-white px-3 text-sm text-ink outline-none transition placeholder:text-muted/60 focus:border-sage-deep focus:ring-2 focus:ring-sage/20";

export function AdminDeliveryZonesView({
  message,
  error,
  zones,
  defaultDeliveryMinimum,
}: AdminDeliveryZonesViewProps) {
  const { t } = useLocale();
  const { formatMoney } = useAdminFormat();

  return (
    <>
      <PageHeader
        eyebrow={t("admin.zones.eyebrow")}
        title={t("admin.zones.title")}
        description={t("admin.zones.desc", {
          amount: formatMoney(defaultDeliveryMinimum),
        })}
      />
      <Notice message={message} error={error} />

      <Card>
        <h2 className="font-serif text-xl text-ink">
          {t("admin.zones.globalTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("admin.zones.globalDesc")}</p>
        <DirtyForm
          action={updateDefaultDeliveryMinimumAction}
          className="mt-4 flex flex-wrap items-end gap-3"
        >
          <label className="block w-40 text-sm font-semibold">
            {t("admin.zones.globalMinimum")}
            <input
              className={fieldClass}
              name="minimum_order"
              type="number"
              min="0"
              step="0.05"
              required
              defaultValue={defaultDeliveryMinimum}
              key={defaultDeliveryMinimum}
            />
          </label>
          <div className="flex min-h-10 items-center">
            <DirtyOnly>
              <PendingSubmitButton pendingLabel={t("admin.zones.saving")}>
                {t("admin.zones.saveGlobal")}
              </PendingSubmitButton>
            </DirtyOnly>
          </div>
        </DirtyForm>
      </Card>

      <Card className="mt-6">
        <h2 className="font-serif text-xl text-ink">
          {t("admin.zones.listTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("admin.zones.addDesc")}</p>

        <div className="mt-4">
          <div className="flex items-center gap-3 border-b border-ink/10 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <span className="w-[5.5rem] shrink-0">{t("admin.zones.postalCode")}</span>
            <span className="w-[7rem] shrink-0">{t("admin.zones.minimum")}</span>
            <span className="w-14 shrink-0 text-center">
              {t("admin.zones.active")}
            </span>
            <span className="min-w-0 flex-1 text-right">
              {t("admin.zones.actions")}
            </span>
          </div>

          <ul className="divide-y divide-ink/8">
            <li className="py-2.5">
              <form
                action={createDeliveryZoneAction}
                className="flex items-center gap-3"
              >
                <input
                  className={inputClass}
                  name="postal_code"
                  inputMode="numeric"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  required
                  placeholder="8590"
                  aria-label={t("admin.zones.postalCode")}
                />
                <input
                  className={minInputClass}
                  name="minimum_order"
                  type="number"
                  min="0"
                  step="0.05"
                  required
                  defaultValue={defaultDeliveryMinimum}
                  aria-label={t("admin.zones.minimum")}
                />
                <label className="flex w-14 shrink-0 items-center justify-center">
                  <input
                    type="checkbox"
                    name="is_active"
                    defaultChecked
                    className="h-4 w-4 rounded border-sage/40"
                    aria-label={t("admin.zones.active")}
                  />
                </label>
                <div className="ml-auto shrink-0">
                  <PendingSubmitButton
                    requireDirty={false}
                    pendingLabel={t("admin.zones.adding")}
                  >
                    {t("admin.zones.add")}
                  </PendingSubmitButton>
                </div>
              </form>
            </li>

            {zones.map((zone) => (
              <li key={zone.id} className="flex items-center gap-3 py-2.5">
                <DirtyForm
                  action={updateDeliveryZoneAction}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <input type="hidden" name="id" value={zone.id} />
                  <input
                    className={inputClass}
                    name="postal_code"
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    aria-label={t("admin.zones.postalCode")}
                    defaultValue={zone.postal_code}
                  />
                  <input
                    className={minInputClass}
                    name="minimum_order"
                    type="number"
                    min="0"
                    step="0.05"
                    required
                    aria-label={t("admin.zones.minimum")}
                    defaultValue={zone.minimum_order}
                  />
                  <label className="flex w-14 shrink-0 items-center justify-center">
                    <input
                      type="checkbox"
                      name="is_active"
                      defaultChecked={zone.is_active}
                      className="h-4 w-4 rounded border-sage/40"
                      aria-label={t("admin.zones.active")}
                    />
                  </label>
                  <div className="ml-auto flex min-h-10 shrink-0 items-center justify-end">
                    <DirtyOnly>
                      <PendingSubmitButton
                        pendingLabel={t("admin.zones.saving")}
                      >
                        {t("admin.zones.save")}
                      </PendingSubmitButton>
                    </DirtyOnly>
                  </div>
                </DirtyForm>
                <form action={deleteDeliveryZoneAction} className="shrink-0">
                  <input type="hidden" name="id" value={zone.id} />
                  <ConfirmSubmitButton
                    label={t("admin.zones.delete")}
                    title={t("admin.zones.deleteTitle")}
                    body={t("admin.zones.deleteBody", {
                      postal: zone.postal_code,
                    })}
                    confirmLabel={t("admin.zones.deleteConfirm")}
                    cancelLabel={t("admin.zones.deleteCancel")}
                    pendingLabel={t("admin.zones.deleting")}
                  />
                </form>
              </li>
            ))}
          </ul>

          {!zones.length ? (
            <p className="mt-3 text-sm text-muted">{t("admin.zones.empty")}</p>
          ) : null}
        </div>
      </Card>
    </>
  );
}
