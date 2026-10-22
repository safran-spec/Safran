/**
 * Testing DB only: open 24h every day + accept orders.
 * Refuses to run unless NEXT_PUBLIC_SUPABASE_URL is the testing project.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const TESTING_HOST = "hlqxpnbtovolvhnwmqwa.supabase.co";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url.includes(TESTING_HOST)) {
  throw new Error(
    `Refusing to write: expected testing project (${TESTING_HOST}), got ${url || "(empty)"}`,
  );
}
if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const rows = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    is_closed: false,
    lunch_opens: "00:00",
    lunch_closes: "23:59",
    dinner_opens: null,
    dinner_closes: null,
    note: "Testing — 24h",
  }));

  const { error: hoursError } = await supabase
    .from("opening_hours")
    .upsert(rows, { onConflict: "weekday" });
  if (hoursError) throw hoursError;

  const { error: availError } = await supabase.from("store_availability").upsert(
    {
      id: true,
      accepts_orders: true,
      pickup_enabled: true,
      delivery_enabled: true,
      minimum_notice_minutes: 0,
      paused_reason: null,
    },
    { onConflict: "id" },
  );
  if (availError) throw availError;

  const { data, error } = await supabase
    .from("opening_hours")
    .select("weekday,is_closed,lunch_opens,lunch_closes,note")
    .order("weekday");
  if (error) throw error;

  console.log(JSON.stringify(data, null, 2));
  console.log("OK: testing DB — 24h open + accepting orders");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
