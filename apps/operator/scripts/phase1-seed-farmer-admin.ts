/**
 * One-time, idempotent backfill for the Farmer/Admin foundation.
 * Run manually: `npx tsx --env-file=.env.local scripts/phase1-seed-farmer-admin.ts`
 * from apps/operator. Mirrors seed-alerts.ts's own connection pattern
 * (PrismaPg adapter + generated client directly — the app's
 * `lib/prisma/client.ts` is `server-only` and can't be imported from a
 * plain Node script). Kept in the repo (not deleted after running) as the
 * documented origin of this data, the same convention seed-alerts.ts/
 * seed-fleet.ts/seed-plots.ts/seed-sensors.ts already follow.
 *
 * Every write here is an upsert/update against a row already seeded by
 * seed-alerts.ts (`usr_admin`, `usr_operator`, `usr_farmer`) — this script
 * adds no new farm, touches no other user's role, and never modifies
 * `usr_isolation_test` (that fixture is left exactly as seed-alerts.ts
 * created it — don't touch existing test fixtures).
 *
 * The only genuinely NEW row is `usr_ahmed_demo` — a Farmer+Operator
 * multi-role account, directly mirroring the worked example
 * ("User: Ahmed / Roles: Farmer, Operator / Farm: Farm A / Default role =
 * Operator") so role-switching has a real account to exercise (Part 23
 * test #13).
 *
 * The password hash below is the SAME bcrypt hash already committed in
 * `lib/auth/user-source.ts` prior to this change (hash of "agrinexus-demo")
 * — copied forward, not newly generated, and not the plaintext password
 * itself.
 */
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/lib/prisma/generated/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// Hash of "agrinexus-demo" — identical to every SEED_USERS entry the old
// in-memory user-source.ts carried before this change.
const DEMO_PASSWORD_HASH = "$2b$10$/v8wrfPNDK9uuCWCPpSnJeQvbb3mG/C6bOuW8jicaMK7HVky0PV5m";

async function main() {
  await prisma.user.update({
    where: { id: "usr_admin" },
    data: { passwordHash: DEMO_PASSWORD_HASH, role: "admin", roles: ["admin"], status: "active" },
  });
  await prisma.user.update({
    where: { id: "usr_operator" },
    data: { passwordHash: DEMO_PASSWORD_HASH, role: "operator", roles: ["operator"], status: "active" },
  });
  await prisma.user.update({
    where: { id: "usr_farmer" },
    data: { passwordHash: DEMO_PASSWORD_HASH, role: "farmer", roles: ["farmer"], status: "active" },
  });

  const ahmed = await prisma.user.upsert({
    where: { id: "usr_ahmed_demo" },
    update: { passwordHash: DEMO_PASSWORD_HASH, role: "operator", roles: ["operator", "farmer"], status: "active" },
    create: {
      id: "usr_ahmed_demo",
      email: "ahmed@agrinexus.ai",
      name: "Ahmed Khan",
      role: "operator",
      roles: ["operator", "farmer"],
      passwordHash: DEMO_PASSWORD_HASH,
      status: "active",
    },
  });

  const demoFarm = await prisma.farm.findUniqueOrThrow({ where: { id: "farm_demo" }, select: { id: true } });

  await prisma.farmMembership.upsert({
    where: { userId_farmId: { userId: "usr_farmer", farmId: demoFarm.id } },
    update: {},
    create: { userId: "usr_farmer", farmId: demoFarm.id },
  });
  await prisma.farmMembership.upsert({
    where: { userId_farmId: { userId: ahmed.id, farmId: demoFarm.id } },
    update: {},
    create: { userId: ahmed.id, farmId: demoFarm.id },
  });

  console.log(
    "Backfilled: usr_admin, usr_operator, usr_farmer (passwordHash/roles); created/updated usr_ahmed_demo; ensured 2 FarmMembership rows against farm_demo.",
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
