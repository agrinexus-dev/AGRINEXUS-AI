import { test, expect } from "../security/fixtures";
import { secureGoto } from "../security/localhost-policy";
import { DEMO_FARMER, DEMO_OPERATOR, loginAs } from "./auth-helpers";

/**
 * "After the security tests pass, run Playwright against the actual
 * AgriNexus local application. Verify only basic functionality... This
 * milestone only proves the secure browser harness works."
 *
 * Deliberately shallow: each test confirms a route loads and shows one
 * piece of real, expected content — never a visual/RTL/Urdu check (out of
 * scope per the explicit instruction), never a deep
 * interaction test. Every navigation goes through `secureGoto` (so an
 * accidental typo pointing off-origin fails loudly rather than silently),
 * and every page is created inside the SAME localhost-only-policy context
 * every security test uses (`../security/fixtures`) — the smoke test runs
 * under the identical security boundary, not a looser one.
 */

test.describe("Application smoke test (Farmer)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
  });

  test("Farmer dashboard (/farmer) loads", async ({ page }) => {
    const response = await secureGoto(page, "http://localhost:3000/farmer");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByRole("navigation", { name: "Farmer navigation" })).toBeVisible();
  });

  test("Farmer AURA route (/farmer/aura) loads", async ({ page }) => {
    const response = await secureGoto(page, "http://localhost:3000/farmer/aura");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("AURA", { exact: true }).first()).toBeVisible();
  });

  test("Farmer Digital Twin route (/farmer/digital-twin) loads", async ({ page }) => {
    const response = await secureGoto(page, "http://localhost:3000/farmer/digital-twin");
    expect(response?.ok()).toBeTruthy();
    // Basic-loading check only — the 3D scene is a canvas, not text content, so
    // this just confirms the route resolves and the page didn't crash.
    await expect(page).toHaveURL(/\/farmer\/digital-twin$/);
  });

  test("Farmer Settings route (/farmer/settings) loads", async ({ page }) => {
    const response = await secureGoto(page, "http://localhost:3000/farmer/settings");
    expect(response?.ok()).toBeTruthy();
    await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
  });
});

test.describe("Application smoke test (Operator)", () => {
  test("Operator home route (/) loads", async ({ page }) => {
    await loginAs(page, DEMO_OPERATOR);
    const response = await secureGoto(page, "http://localhost:3000/");
    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveURL("http://localhost:3000/");
  });
});
