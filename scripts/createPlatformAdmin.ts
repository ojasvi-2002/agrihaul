/**
 * scripts/createPlatformAdmin.ts
 *
 * CLAUDE.md §34 — bootstraps the first platform administrator. There is
 * deliberately no self-serve signup for this (unlike organization
 * owners in Phase 12) — anyone who could self-register here would have
 * visibility across every customer organization.
 *
 * Idempotent: re-running with the same email updates the name/password
 * instead of creating a duplicate.
 *
 * USAGE
 *   npx tsx scripts/createPlatformAdmin.ts --name="Ada Admin" --email=ada@agrihaul.internal --password=SomeStrongPassword123!
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { getPrismaClient } from "./lib/prismaClient";

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

async function main() {
  const name = getArg("name");
  const email = getArg("email")?.trim().toLowerCase();
  const password = getArg("password");

  if (!name || !email || !password) {
    console.error(
      'Usage: npx tsx scripts/createPlatformAdmin.ts --name="Ada Admin" --email=ada@agrihaul.internal --password=SomeStrongPassword123!',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await prisma.platformAdmin.findUnique({ where: { email } });
  if (existing) {
    await prisma.platformAdmin.update({ where: { id: existing.id }, data: { name, passwordHash } });
    console.log(`Updated existing platform admin "${email}".`);
  } else {
    await prisma.platformAdmin.create({ data: { name, email, passwordHash } });
    console.log(`Created platform admin "${email}".`);
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
