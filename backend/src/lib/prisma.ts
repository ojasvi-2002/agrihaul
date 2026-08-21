// PrismaClient resolves via ancestor node_modules lookup to the repo
// root (backend/ has no local @prisma/client — see prisma.config.ts and
// database/prisma/schema.prisma's generator `output`). One shared
// instance avoids exhausting Postgres connections under tsx's watch-mode
// hot reload.
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../config/env";

const adapter = new PrismaPg({ connectionString: env.databaseUrl });

export const prisma = new PrismaClient({ adapter });
