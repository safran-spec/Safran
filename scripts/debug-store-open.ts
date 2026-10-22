import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import {
  isWithinOpeningHours,
  zonedNow,
} from "../src/backend/domain/opening-hours";

loadEnv({ path: [".env.local", ".env"], quiet: true });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const now = zonedNow("Europe/Zurich");
  const [hours, avail, settings, today] = await Promise.all([
    supabase.from("opening_hours").select("*").order("weekday"),
    supabase.from("store_availability").select("*"),
    supabase.from("store_settings").select("*").maybeSingle(),
    supabase
      .from("opening_hours")
      .select("*")
      .eq("weekday", now.weekday)
      .maybeSingle(),
  ]);

  console.log(
    JSON.stringify(
      {
        url,
        now,
        withinToday: isWithinOpeningHours(today.data, now.time),
        today: today.data,
        todayErr: today.error,
        avail: avail.data,
        settings: settings.data,
        hours: hours.data,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
