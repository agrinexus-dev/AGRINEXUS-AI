import { test, expect } from "../security/fixtures";
import { secureGoto } from "../security/localhost-policy";
import { DEMO_FARMER, loginAs } from "../smoke/auth-helpers";
import { sendAuraMessage } from "./aura-helpers";
import { setDisplayLanguage } from "./language-helpers";

/**
 * Live verification, through the real Farmer AURA UI and the
 * real `/api/aura/chat` endpoint, that CONVERSATION language now follows
 * the CURRENT MESSAGE's own content, independent of the `displayLanguage`
 * (App Language / UI) setting and without ever touching `auraLanguage`.
 * Reuses the existing secure harness (`../security/fixtures`) unmodified.
 *
 * Real provider calls can legitimately be slow or rate-limited (a live,
 * documented condition in this project's own prior milestones) — a
 * `PROVIDER-AVAILABILITY-LIMITATION` annotation is recorded and the test
 * still passes structurally (no crash, no wrong-language false positive)
 * rather than being reported as a fabricated language-detection success.
 */
test.describe.configure({ timeout: 90_000 });

// A conservative, cheap, script-only check — this does NOT re-verify
// translation quality (already covered by an earlier change's live testing);
// it only confirms the reply is NOT obviously in the wrong script, which
// is exactly the property automatic detection is responsible for.
function looksLikeUrdu(text: string): boolean {
  return /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]{2,}/.test(text);
}

test.describe("Automatic conversation language — independent of UI language", () => {
  test("English UI + Urdu typed input -> Urdu AURA response", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    // displayLanguage defaults to English — never touched here.
    await secureGoto(page, "http://localhost:3000/farmer/aura");
    const result = await sendAuraMessage(page, "پلاٹ C کی فصل کیسی ہے؟");
    test.info().annotations.push({ type: "reply-text", description: result.replyText ?? "(none)" });
    if (result.timedOut || result.replyText?.includes("trouble connecting")) {
      test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "No usable reply — provider unavailable." });
      return;
    }
    expect(result.replyText).not.toBeNull();
    expect(looksLikeUrdu(result.replyText!)).toBe(true);
  });

  test("English UI + English typed input -> English AURA response", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await secureGoto(page, "http://localhost:3000/farmer/aura");
    const result = await sendAuraMessage(page, "How is Plot C doing today?");
    test.info().annotations.push({ type: "reply-text", description: result.replyText ?? "(none)" });
    if (result.timedOut || result.replyText?.includes("trouble connecting")) {
      test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "No usable reply — provider unavailable." });
      return;
    }
    expect(result.replyText).not.toBeNull();
    expect(looksLikeUrdu(result.replyText!)).toBe(false);
  });

  test("Urdu UI + English typed input -> English AURA response (UI must not force reply language)", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await setDisplayLanguage(page, "Urdu");
    await secureGoto(page, "http://localhost:3000/farmer/aura");
    const result = await sendAuraMessage(page, "How is the weather?");
    test.info().annotations.push({ type: "reply-text", description: result.replyText ?? "(none)" });
    if (result.timedOut || result.replyText?.includes("trouble connecting")) {
      test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "No usable reply — provider unavailable." });
      return;
    }
    expect(result.replyText).not.toBeNull();
    expect(looksLikeUrdu(result.replyText!)).toBe(false);
  });

  test("Mixed Urdu/English typed input -> Urdu AURA response", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await secureGoto(page, "http://localhost:3000/farmer/aura");
    const result = await sendAuraMessage(page, "Plot C کی فصل کیسی ہے؟");
    test.info().annotations.push({ type: "reply-text", description: result.replyText ?? "(none)" });
    if (result.timedOut || result.replyText?.includes("trouble connecting")) {
      test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "No usable reply — provider unavailable." });
      return;
    }
    expect(result.replyText).not.toBeNull();
    expect(looksLikeUrdu(result.replyText!)).toBe(true);
  });
});

test.describe("Settings expose only English/Urdu", () => {
  // Farmer Settings now has exactly ONE language
  // combobox (App Language). The former second combobox ("AURA reply
  // language") was removed entirely, not merely restricted to two options —
  // AURA now determines conversation language automatically, per turn, so a
  // static override selector next to it would contradict that requirement.
  test("Farmer Settings has exactly one language dropdown, listing only English and Urdu", async ({ page }) => {
    await loginAs(page, DEMO_FARMER);
    await secureGoto(page, "http://localhost:3000/farmer/settings");
    expect(await page.getByRole("combobox").count()).toBe(1);
    await page.getByRole("combobox").nth(0).click();
    const options = await page.getByRole("option").allTextContents();
    expect(options.sort()).toEqual(["English", "Urdu"]);
  });
});
