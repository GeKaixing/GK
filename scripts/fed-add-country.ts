/**
 * Add a peer Country to the federation, from its OSP discovery document.
 * Default recognition is UNKNOWN — run fed-recognize to admit its content.
 * Usage:
 *   npx tsx --env-file=.env.development.local scripts/fed-add-country.ts <host>
 */
import { RecognitionState } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { fetchCountryWellKnown, setRecognition } from "@/lib/osp/federation";

async function main(): Promise<void> {
  const host = process.argv[2];
  if (!host) {
    console.error("Usage: fed-add-country <host>");
    process.exit(1);
  }

  const doc = await fetchCountryWellKnown(host);
  const remote = await prisma.remoteCountry.upsert({
    where: { id: doc.country_id },
    update: {
      name: doc.name,
      publicKey: doc.public_key,
      federationEndpoint: doc.federation_endpoint,
    },
    create: {
      id: doc.country_id,
      name: doc.name,
      publicKey: doc.public_key,
      federationEndpoint: doc.federation_endpoint,
    },
  });
  await setRecognition(remote.id, RecognitionState.UNKNOWN);

  console.log(`✔ Added country ${remote.id} (${remote.name})`);
  console.log(`  public key: ${remote.publicKey.slice(0, 32)}…`);
  console.log(`  federation endpoint: ${remote.federationEndpoint}`);
  console.log(
    `  recognition: UNKNOWN — run \`fed-recognize ${remote.id} --state=RECOGNIZED\` to admit its content.`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
