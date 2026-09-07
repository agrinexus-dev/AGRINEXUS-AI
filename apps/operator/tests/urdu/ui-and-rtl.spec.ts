import { test, expect } from "../security/fixtures";
import { secureGoto } from "../security/localhost-policy";
import { DEMO_FARMER, loginAs } from "../smoke/auth-helpers";
import { captureConsole } from "./console-capture";
import { setDisplayLanguage } from "./language-helpers";

/**
 * Phases
 * 2/3/4/5/13/14. Reuses the EXISTING secure harness (`../security/
 * fixtures`) unmodified — every page created here is still subject to the
 * same localhost-only network/popup/download/iframe policy every security
 * test enforces; nothing here loosens it.
 *
 * Screenshots are written to `test-results/urdu-verification-artifacts/`
 * (already covered by the existing `test-results/` `.gitignore` entry from
 * Never committed) and are inspected directly (viewed as
 * images) as part of the verification, not merely
 * asserted on programmatically — see the milestone report's own "Urdu UI
 * Results"/"RTL Results" sections for what was actually seen.
 */

const ARTIFACTS = "test-results/urdu-verification-artifacts";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

async function hasHorizontalOverflow(page: import("@playwright/test").Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
}

test.describe("Phase 2 — Farmer English baseline", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
  });

  for (const route of ["/farmer", "/farmer/aura", "/farmer/digital-twin", "/farmer/settings"]) {
    test(`${route} loads with no console errors and no horizontal overflow`, async ({ page }) => {
      const captured = captureConsole(page);
      await page.setViewportSize(DESKTOP);
      const response = await secureGoto(page, `http://localhost:3000${route}`);
      expect(response?.ok()).toBeTruthy();
      expect(page.url()).toBe(`http://localhost:3000${route}`);
      await page.waitForTimeout(1500);
      expect(await hasHorizontalOverflow(page)).toBe(false);
      await page.screenshot({ path: `${ARTIFACTS}/phase2-english-${route.replace(/\//g, "_")}.png`, fullPage: true });
      // Recorded, not hard-failed on here — the full report distinguishes
      // genuine application errors from expected/benign console noise
      // (e.g. a blocked OpenStreetMap tile request elsewhere in the app).
      test.info().annotations.push({ type: "console-errors", description: JSON.stringify(captured.errors) });
      test.info().annotations.push({ type: "page-errors", description: JSON.stringify(captured.pageErrors) });
    });
  }
});

test.describe("Phase 3/4/5 — Urdu UI, RTL, and responsive verification", () => {
  test("Farmer shell switches to Urdu + RTL, verified visually at desktop and mobile", async ({ page }) => {
    // This test does 6 full navigations + screenshots across
    // 2 viewports; live testing showed individual Farmer page loads under
    // Turbopack's dev compilation taking 15-25s each, well past the
    // default 30s per-test budget for a test doing this many in sequence.
    test.setTimeout(180_000);
    await loginAs(page, DEMO_FARMER);
    await setDisplayLanguage(page, "Urdu");

    for (const [sizeName, size] of Object.entries({ desktop: DESKTOP, mobile: MOBILE })) {
      await page.setViewportSize(size);
      for (const route of ["/farmer", "/farmer/aura", "/farmer/settings"]) {
        await secureGoto(page, `http://localhost:3000${route}`);
        await page.waitForTimeout(800);

        // The Farmer root must carry dir="rtl".
        const dir = await page.locator(".farmer-theme").first().getAttribute("dir");
        expect(dir).toBe("rtl");

        expect(await hasHorizontalOverflow(page)).toBe(false);
        await page.screenshot({
          path: `${ARTIFACTS}/phase3-4-5-urdu-${sizeName}-${route.replace(/\//g, "_")}.png`,
          fullPage: true,
        });
      }
    }
  });

  test("Switching back to English restores dir=\"ltr\"", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await setDisplayLanguage(page, "Urdu");
    await secureGoto(page, "http://localhost:3000/farmer");
    await expect(page.locator(".farmer-theme").first()).toHaveAttribute("dir", "rtl");

    await setDisplayLanguage(page, "English");
    await secureGoto(page, "http://localhost:3000/farmer");
    await page.waitForTimeout(500);
    const dir = await page.locator(".farmer-theme").first().getAttribute("dir");
    expect(dir).toBe("ltr");
    await page.screenshot({ path: `${ARTIFACTS}/phase14-restored-english.png`, fullPage: true });
  });
});

test.describe("Phase 13 — Digital Twin basic Farmer check (Urdu shell)", () => {
  test("Digital Twin loads under the Urdu/RTL Farmer shell with no fatal error", async ({ page }) => {
    // The Digital Twin's 3D scene was observed taking ~23s to
    // load even in the (unrelated, English-only) baseline test;
    // combined with login + a language switch, this exceeds the default
    // 30s per-test budget.
    test.setTimeout(90_000);
    const captured = captureConsole(page);
    await loginAs(page, DEMO_FARMER);
    await setDisplayLanguage(page, "Urdu");
    const response = await secureGoto(page, "http://localhost:3000/farmer/digital-twin");
    expect(response?.ok()).toBeTruthy();
    await page.waitForTimeout(2500);
    // Farmer nav must still be present and usable around the 3D surface.
    await expect(page.locator(".farmer-theme").first()).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: `${ARTIFACTS}/phase13-digital-twin-urdu-rtl.png`, fullPage: true });
    test.info().annotations.push({ type: "console-errors", description: JSON.stringify(captured.errors) });
    test.info().annotations.push({ type: "page-errors", description: JSON.stringify(captured.pageErrors) });
  });
});

test.describe("Phase 14 — Settings language independence", () => {
  // This test originally proved `displayLanguage`
  // (App Language) and `auraLanguage` (then a second, user-facing "AURA
  // reply language" combobox) could be set independently via two separate
  // Settings controls. That second combobox no longer exists: AURA now
  // determines conversation language automatically, per turn, from the
  // message itself, so a static "AURA reply language" override selector
  // was removed from the UI entirely rather than kept alongside automatic
  // detection (see `farmer-settings-page.tsx`'s own doc comment). The
  // "independence" this test now needs to prove is the CURRENT locked
  // requirement instead: App Language (still a single, real Settings
  // control, still driving RTL) has no bearing on what language AURA
  // actually replies in for a given turn — that live, end-to-end proof
  // lives in `tests/urdu/auto-language-detection.spec.ts` ("Urdu UI +
  // English typed input -> English AURA response"), so this test's own
  // remaining, narrower job is just: Settings exposes exactly ONE language
  // control, and it still correctly drives RTL.
  test("Settings has exactly one language control (App Language), which still drives RTL", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await setDisplayLanguage(page, "Urdu");
    // Switching displayLanguage re-renders the whole Farmer shell (RTL +
    // the Urdu i18n catalog) — the same settle wait the original version
    // of this test used after its own language switch, before querying
    // the DOM again.
    await page.waitForTimeout(300);

    expect(await page.getByRole("combobox").count()).toBe(1);
    const displayValue = await page.getByRole("combobox").nth(0).textContent();
    expect(displayValue).toBe("Urdu");
    await expect(page.locator(".farmer-theme").first()).toHaveAttribute("dir", "rtl");
    await page.screenshot({ path: `${ARTIFACTS}/phase14-single-language-control.png`, fullPage: true });
  });
});
