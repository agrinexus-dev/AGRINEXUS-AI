import type { Page } from "@playwright/test";

import { secureGoto } from "../security/localhost-policy";

/**
 * The ONLY
 * credentials this test harness ever uses. Both are pre-existing,
 * already-committed demo/seed accounts documented in this repo's own
 * `apps/operator/scripts/phase1-seed-farmer-admin.ts` (the password is
 * that script's own documented plaintext, "agrinexus-demo" — hashed and
 * seeded into the demo database; not a production credential, not read
 * from `.env`/`.env.local`, not a real person's account). The rule:
 * "use ONLY dedicated existing AgriNexus demo/test accounts... do not read
 * or expose.env secrets merely for convenience" — these two constants
 * satisfy that without touching any
 * environment file.
 */
export const DEMO_FARMER = { email: "farmer@agrinexus.ai", password: "agrinexus-demo" } as const;
export const DEMO_OPERATOR = { email: "operator@agrinexus.ai", password: "agrinexus-demo" } as const;

/**
 * Logs in through the REAL login form (`login-form.tsx`) — types into the
 * actual `#email`/`#password` fields and submits, exactly like a person
 * would, rather than forging a session cookie. Never logs the password;
 * never screenshots this page under trace (traces only capture on-failure,
 * and a successful login here is the expected, non-failing path).
 */
export async function loginAs(page: Page, credentials: { email: string; password: string }): Promise<void> {
  await secureGoto(page, "http://localhost:3000/login");
  await page.locator("#email").fill(credentials.email);
  await page.locator("#password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  // Bumped from 15s to 30s: live testing found the FIRST
  // request of a fresh Playwright run can take 15-25s under Next.js
  // Turbopack's on-demand dev compilation (confirmed by the same run's own
  // later, already-warm page loads completing in well under that), and a
  // login redirect on a still-cold server was observed exceeding the old
  // 15s bound. A tolerance increase only — no assertion here changed.
  await page.waitForURL((url) => url.origin === "http://localhost:3000" && url.pathname !== "/login", { timeout: 30_000 });
}
