import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

/**
 * The single Prisma client instance for this app. `server-only`
 * guarantees this — and by extension `DATABASE_URL` — can never end up in a
 * client bundle; every caller is a Route Handler or another server-only
 * module. Prisma 7's new client generator requires an explicit driver
 * adapter (`PrismaPg`) rather than parsing `DATABASE_URL` implicitly — see
 * the generated client's own doc comment.
 *
 * Cached on `globalThis` in development so Next's hot-reload (which re-runs
 * this module on every edit) doesn't open a fresh pool of Postgres
 * connections each time — a well-known, standard Prisma-with-Next.js
 * pattern, not something specific to this app's architecture.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — see apps/operator/.env.example.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
