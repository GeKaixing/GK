/**
 * Promote / demote a user's dashboard admin role.
 * Usage:
 *   npx tsx --env-file=.env.development.local scripts/set-admin.ts <email|userid|id> --admin
 *   npx tsx --env-file=.env.development.local scripts/set-admin.ts <email|userid|id> --standard
 */
import { prisma } from "@/lib/prisma";
import { UserRole } from "@/generated/prisma/enums";

async function main(): Promise<void> {
  const target = process.argv[2];
  const mode = process.argv[3] === "--standard" ? UserRole.STANDARD : UserRole.ADMIN;

  if (!target) {
    console.error("Usage: set-admin <email|userid|id> [--admin|--standard]");
    process.exit(1);
  }

  const user =
    (await prisma.user.findUnique({ where: { email: target } }).catch(() => null)) ??
    (await prisma.user.findUnique({ where: { userid: target } }).catch(() => null)) ??
    (await prisma.user.findUnique({ where: { id: target } }).catch(() => null));

  if (!user) {
    console.error(`User not found: ${target}`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: mode },
  });

  console.log(`Set role=${updated.role} for ${updated.email}`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
