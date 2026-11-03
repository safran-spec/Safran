"use client";

import {
  clearOrderAlertSoundAction,
  setOrderAlertEnabledAction,
  updateOpeningHoursAction,
  updateSettingsAction,
  uploadOrderAlertSoundAction,
} from "@/app/admin/actions";
import { AdminFileInput } from "@/components/admin/admin-file-input";
import { DirtyForm } from "@/components/admin/dirty-form";
import { HoursDayFields } from "@/components/admin/hours-day-fields";
import { PendingSubmitButton } from "@/components/admin/pending-submit-button";
import {
  Card,
  Notice,
  PageHeader,
  fieldClass,
} from "@/components/admin/ui";
import { useLocale } from "@/lib/i18n/locale-context";

type AdminSettingsViewProps = {
  message?: string;
  error?: string;
  formKey: string;
  settings: Record<string, unknown>;
  availability: {
    pickup_enabled?: boolean;
    delivery_enabled?: boolean;
    minimum_notice_minutes?: number;
  } | null;
  hours: Array<{
    weekday: number;
    is_closed: boolean;
    lunch_opens: string | null;
    lunch_closes: string | null;
    dinner_opens: string | null;
    dinner_closes: string | null;
  }>;
  orderAlert: { enabled: boolean; soundUrl: string | null };
};

function timeValue(value: string | null | undefined) {
  return value?.slice(0, 5) ?? "";
}

/** Prefer continuous open→close when a legacy lunch+dinner row still exists. */
function dayWindow(row: {
  lunch_opens: string | null;
  lunch_closes: string | null;
  dinner_opens: string | null;
  dinner_closes: string | null;
} | undefined) {
  if (!row) return { opens: "", closes: "" };
  return {
    opens: timeValue(row.lunch_opens ?? row.dinner_opens),
    closes: timeValue(row.dinner_closes ?? row.lunch_closes),
  };
}

export function AdminSettingsView({
  message,
  error,
  formKey,
  settings,
  availability,
  hours,
  orderAlert,
}: AdminSettingsViewProps) {
  const { t } = useLocale();
  const hoursByDay = new Map(hours.map((row) => [row.weekday, row]));

  return (
    <>
      <PageHeader
        eyebrow={t("admin.settings.eyebrow")}
        title={t("admin.settings.title")}
        description={t("admin.settings.desc")}
      />
      <Notice message={message} error={error} />

      <div className="space-y-5">
        <Card>
          <h2 className="font-sans text-2xl font-semibold tracking-tight">
            {t("admin.settings.alertTitle")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {t("admin.settings.alertDesc")}
          </p>
          <DirtyForm
            key={`alert-enabled-${formKey}`}
            action={setOrderAlertEnabledAction}
            className="mt-5 flex flex-wrap items-center gap-3"
          >
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                name="enabled"
                value="on"
                defaultChecked={orderAlert.enabled}
                className="size-4 rounded border-sage/40"
              />
              {t("admin.settings.alertEnabled")}
            </label>
            <PendingSubmitButton pendingLabel={t("admin.settings.saving")}>
              {t("admin.settings.save")}
            </PendingSubmitButton>
          </DirtyForm>

          <div className="mt-6 border-t border-sage/15 pt-5">
            <p className="text-sm font-semibold">
              {t("admin.settings.customSound")}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t("admin.settings.customSoundHint")}
            </p>
            {orderAlert.soundUrl ? (
              <audio
                key={orderAlert.soundUrl}
                className="mt-3 w-full max-w-md"
                controls
                preload="metadata"
                src={orderAlert.soundUrl}
              />
            ) : (
              <p className="mt-3 text-sm text-muted">
                {t("admin.settings.noCustomSound")}
              </p>
            )}
            <DirtyForm
              key={`alert-upload-${formKey}`}
              action={uploadOrderAlertSoundAction}
              className="mt-4 flex flex-wrap items-center gap-3"
            >
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="mb-1.5 text-sm font-semibold">
                  {t("admin.settings.audioFile")}
                </p>
                <AdminFileInput
                  name="sound"
                  required
                  accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/mp4,audio/x-m4a,.mp3,.wav,.ogg,.m4a"
                />
              </div>
              <PendingSubmitButton pendingLabel={t("admin.settings.uploading")}>
                {t("admin.settings.upload")}
              </PendingSubmitButton>
            </DirtyForm>
            {orderAlert.soundUrl ? (
              <form action={clearOrderAlertSoundAction} className="mt-3">
                <PendingSubmitButton
                  variant="secondary"
                  requireDirty={false}
                  pendingLabel={t("admin.settings.removing")}
                >
                  {t("admin.settings.removeSound")}
                </PendingSubmitButton>
              </form>
            ) : null}
          </div>
        </Card>

        <Card>
          <h2 className="font-sans text-2xl font-semibold tracking-tight">
            {t("admin.settings.restaurant")}
          </h2>
          <DirtyForm
            key={`restaurant-${formKey}`}
            action={updateSettingsAction}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="block text-sm font-semibold sm:col-span-2">
              {t("admin.settings.restaurantName")}
              <input
                className={fieldClass}
                name="restaurant_name"
                defaultValue={String(settings.restaurant_name ?? "Safran")}
                required
              />
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.email")}
              <input
                className={fieldClass}
                name="email"
                type="email"
                defaultValue={String(settings.contact_email ?? "")}
              />
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.phone")}
              <input
                className={fieldClass}
                name="phone"
                type="tel"
                defaultValue={String(settings.contact_phone ?? "")}
              />
            </label>
            <label className="block text-sm font-semibold sm:col-span-2">
              {t("admin.settings.address")}
              <input
                className={fieldClass}
                name="address"
                defaultValue={String(settings.address ?? "")}
              />
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.deliveryMin")}
              <input
                className={fieldClass}
                name="minimum_order"
                type="number"
                min="0"
                step="0.05"
                defaultValue={Number(settings.delivery_minimum ?? 0)}
              />
              <span className="mt-1.5 block text-xs font-normal text-muted">
                {t("admin.settings.deliveryMinHint")}
              </span>
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.pickupMin")}
              <input
                className={fieldClass}
                name="pickup_minimum"
                type="number"
                min="0"
                step="0.05"
                defaultValue={Number(settings.pickup_minimum ?? 0)}
              />
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.deliveryFee")}
              <input
                className={fieldClass}
                name="delivery_fee"
                type="number"
                min="0"
                step="0.05"
                defaultValue={Number(settings.delivery_fee ?? 0)}
              />
            </label>
            <label className="block text-sm font-semibold">
              {t("admin.settings.noticeMinutes")}
              <input
                className={fieldClass}
                name="minimum_notice_minutes"
                type="number"
                min="0"
                step="5"
                defaultValue={availability?.minimum_notice_minutes ?? 30}
              />
            </label>
            <div className="flex flex-wrap gap-5 sm:col-span-2">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  name="pickup_enabled"
                  type="checkbox"
                  defaultChecked={availability?.pickup_enabled ?? true}
                />{" "}
                {t("admin.settings.offerPickup")}
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  name="delivery_enabled"
                  type="checkbox"
                  defaultChecked={availability?.delivery_enabled ?? true}
                />{" "}
                {t("admin.settings.offerDelivery")}
              </label>
            </div>
            <PendingSubmitButton
              className="sm:col-span-2 sm:justify-self-start"
              pendingLabel={t("admin.common.saving")}
            >
              {t("admin.settings.saveRestaurant")}
            </PendingSubmitButton>
          </DirtyForm>
        </Card>

        <Card>
          <h2 className="font-sans text-2xl font-semibold tracking-tight">
            {t("admin.settings.hoursTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {t("admin.settings.hoursDesc")}
          </p>
          <DirtyForm
            key={`hours-${formKey}-${hours.map((h) => `${h.weekday}:${h.lunch_opens}:${h.dinner_closes ?? h.lunch_closes}`).join("|")}`}
            action={updateOpeningHoursAction}
            className="mt-5"
          >
            <div className="space-y-3">
              {Array.from({ length: 7 }, (_, index) => {
                const row = hoursByDay.get(index);
                const window = dayWindow(row);
                return (
                  <HoursDayFields
                    key={index}
                    index={index}
                    defaultClosed={row?.is_closed ?? index === 0}
                    opens={window.opens}
                    closes={window.closes}
                  />
                );
              })}
            </div>
            <PendingSubmitButton
              className="mt-5"
              pendingLabel={t("admin.settings.savingHours")}
            >
              {t("admin.settings.saveHours")}
            </PendingSubmitButton>
          </DirtyForm>
        </Card>
      </div>
    </>
  );
}
