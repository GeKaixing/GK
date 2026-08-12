/**
 * Set our directional recognition state toward a peer Country (RFC-011).
 * Usage:
 *   npx tsx --env-file=.env.development.local scripts/fed-recognize.ts <countryId> --state=RECOGNIZED
 * States: RECOGNIZED | TRUSTED | RESTRICTED | BLOCKED | SUSPENDED | UNKNOWN
 */
import { RecognitionState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { setRecognition } from "@/lib/osp/federation";

async function main(): Promise<void> {
  const countryId = process.argv[2];
  const stateArg = process.argv[3];
  if (!countryId || !stateArg) {
    console.error("Usage: fed-recognize <countryId> --state=<RECOGNIZED|TRUSTED|RESTRICTED|BLOCKED|SUSPENDED|UNKNOWN>");
    process.exit(1);
  }
  const state = stateArg.replace(/^--state=/, "").toUpperCase() as RecognitionState;
  if (!Object.values(RecognitionState).includes(state)) {
    console.error(`Invalid state: ${state}`);
    process.exit(1);
  }

  const remote = await prisma.remoteCountry.findUnique({ where: { id: countryId } });
  if (!remote) {
    console.error(`Unknown remote country: ${countryId} — run fed-add-country first.`);
    process.exit(1);
  }

  const rec = await setRecognition(countryId, state);
  console.log(`✔ ${countryId} (${remote.name}) recognition → ${rec.state}`);
  if (state === "RECOGNIZED" || state === "TRUSTED") {
    console.log("  Its public content will now be admitted into the federated surface.");
  } else if (state === "BLOCKED") {
    console.log("  Its content is denied.");
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
