/**
 * Process due outbound federation deliveries (PENDING / FAILED past their retry
 * window). Exponential backoff on failure. Safe to run repeatedly.
 * Usage:
 *   npx tsx --env-file=.env.development.local scripts/fed-deliver.ts
 */
import { deliverPending } from "@/lib/osp/federation";

async function main(): Promise<void> {
  const result = await deliverPending();
  console.log(
    `✔ Deliveries: processed=${result.processed} sent=${result.sent} failed=${result.failed}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
