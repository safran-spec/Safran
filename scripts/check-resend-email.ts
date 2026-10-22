import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const id = process.argv[2]?.trim();
  if (!apiKey || !id) {
    throw new Error("Usage: npx tsx scripts/check-resend-email.ts <email_id>");
  }

  const response = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = await response.text();
  console.log(response.status, body);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
