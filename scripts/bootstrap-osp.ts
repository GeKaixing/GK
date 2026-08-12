/**
 * OSP bootstrap: ensure the Country, the GKX AI service actor, and backfill an
 * Actor + Passport for every existing user. Idempotent — safe to re-run at
 * every deploy (passports are never re-issued, capabilities are not re-granted,
 * lifecycle events are not duplicated).
 *
 * Usage:
 *   npx tsx --env-file=.env.development.local scripts/bootstrap-osp.ts
 */
import { prisma } from "@/lib/prisma";
import { ensureAiServiceActor, ensureCitizen, ensureCountry } from "@/lib/osp";

async function main(): Promise<void> {
  const country = await ensureCountry();
  console.log(`✔ Country ${country.id} (${country.name}) ready — publicKey ${country.publicKey.slice(0, 24)}…`);

  const ai = await ensureAiServiceActor();
  console.log(`✔ AI service actor ready — passport ${ai.passport.id} (status ${ai.passport.status})`);

  const users = await prisma.user.findMany({ select: { id: true, role: true } });
  console.log(`Backfilling OSP identity for ${users.length} user(s)…`);

  let passports = 0;
  for (const user of users) {
    const { passport, actor } = await ensureCitizen(user.id);
    if (passport.status === "ACTIVE") passports += 1;
    void actor;
  }

  console.log(`✔ Backfill complete — ${passports} active passport(s).`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
