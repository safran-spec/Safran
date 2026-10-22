import { config as loadEnv } from "dotenv";
import { Resend } from "resend";

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  const kitchen = process.env.ORDER_NOTIFY_EMAIL?.trim();
  const guest = process.argv[2]?.trim() || "manas03704085@gmail.com";

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY / RESEND_FROM missing");
  }

  const resend = new Resend(apiKey);
  console.log({ from, kitchen, guest });

  const guestResult = await resend.emails.send({
    from,
    to: guest,
    subject: `Safran test guest receipt ${Date.now()}`,
    text: "Guest receipt test",
    html: "<p>Guest receipt test</p>",
  });
  console.log("guest →", JSON.stringify(guestResult, null, 2));

  if (kitchen) {
    const kitchenResult = await resend.emails.send({
      from,
      to: kitchen,
      subject: `Safran test kitchen ${Date.now()}`,
      text: "Kitchen notify test",
      html: "<p>Kitchen notify test</p>",
    });
    console.log("kitchen →", JSON.stringify(kitchenResult, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
