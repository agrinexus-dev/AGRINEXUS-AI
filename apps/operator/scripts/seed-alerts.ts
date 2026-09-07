/**
 * One-time dev seed for the Alerts vertical slice — NOT part
 * of any app's runtime, run manually: `npx tsx scripts/seed-alerts.ts` from
 * apps/operator (needs `DATABASE_URL` set — reads apps/operator/.env.local).
 * Not wired into any build/deploy step; a hackathon-appropriate one-off, not
 * a migration. Lives here (not in apps/backend/prisma, where the schema
 * itself lives) because it needs `@prisma/adapter-pg` and the generated
 * client, both of which are apps/operator dependencies — see that schema
 * file's own doc comment for why the generator output was redirected here.
 *
 * Seeds:
 *  - The same 3 users already hardcoded in apps/operator's
 *  `lib/auth/user-source.ts` (SAME ids, so `session.user.id` from the
 *  EXISTING, unchanged NextAuth Credentials flow already matches a real
 *  row here — auth itself is not touched by this prompt).
 *  - ONE shared "AgriNexus Demo Farm" owned by the admin user — both admin
 *  and operator resolve to this same farm at the ownership-check layer
 *  (see lib/farm/current-farm.ts), matching how the app already behaves
 *  today (both roles see the identical shared environment; there's no
 *  per-user farm segregation in the product yet).
 *  - ONE separate "Isolation Test Farm" owned by a user NOT reachable
 *  through the Operator app's login (OPERATOR_APP_ROLES only allows
 *  admin/operator) — its only purpose is to prove the ownership check
 *  genuinely rejects cross-farm reads (the "test unauthorized access"
 *  case). One seed Alert lives on it.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/lib/prisma/generated/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  await prisma.user.upsert({
    where: { id: "usr_admin" },
    update: {},
    create: { id: "usr_admin", email: "admin@agrinexus.ai", name: "AgriNexus Admin", role: "admin" },
  });
  await prisma.user.upsert({
    where: { id: "usr_operator" },
    update: {},
    create: { id: "usr_operator", email: "operator@agrinexus.ai", name: "AgriNexus Operator", role: "operator" },
  });
  await prisma.user.upsert({
    where: { id: "usr_farmer" },
    update: {},
    create: { id: "usr_farmer", email: "farmer@agrinexus.ai", name: "AgriNexus Farmer", role: "farmer" },
  });
  // Test-only user, deliberately outside OPERATOR_APP_ROLES and outside
  // SEED_USERS — exists purely so "Isolation Test Farm" has a real owner
  // distinct from every user that can actually sign in to this app.
  await prisma.user.upsert({
    where: { id: "usr_isolation_test" },
    update: {},
    create: { id: "usr_isolation_test", email: "isolation-test@agrinexus.ai", name: "Isolation Test Owner", role: "farmer" },
  });

  const demoFarm = await prisma.farm.upsert({
    where: { id: "farm_demo" },
    update: {},
    create: { id: "farm_demo", name: "AgriNexus Demo Farm", ownerId: "usr_admin" },
  });

  const isolationFarm = await prisma.farm.upsert({
    where: { id: "farm_isolation_test" },
    update: {},
    create: { id: "farm_isolation_test", name: "Isolation Test Farm", ownerId: "usr_isolation_test" },
  });

  // The isolation-test Alert itself is seeded by `seed-sensors.ts` instead
  // (Alert.sensorId is a real FK to Sensor — this script runs before any
  // Sensor exists, so creating that Alert here would violate the FK on a
  // freshly-migrated database; see that script for the actual Alert).
  console.log("Seeded:", { demoFarm: demoFarm.id, isolationFarm: isolationFarm.id });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
