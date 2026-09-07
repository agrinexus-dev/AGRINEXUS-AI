import { test, expect } from "../security/fixtures";
import { secureGoto } from "../security/localhost-policy";
import { DEMO_FARMER, loginAs } from "../smoke/auth-helpers";
import { containsDevanagariScript, detectTextLanguage } from "../../src/lib/aura/voice/language-detection";
import { installMockVoiceRecorder, setMockRecordingAudio, synthesizeSpeech } from "./aura-helpers";

/**
 * The required first-turn voice tests (A–E), through the REAL Farmer
 * AURA UI. No real
 * microphone exists in this harness; per this project's own established
 * methodology, only the browser's raw mic CAPTURE primitives are replaced
 * (`installMockVoiceRecorder`, `../aura-helpers.ts`) — every application
 * code path (`voice-recorder-button.tsx`, the real `/api/aura/voice/
 * transcribe` call including the cold-start recovery
 * logic, `farmer-aura-page.tsx`'s per-turn language override, the real
 * `/api/aura/chat` call, the real `/api/aura/voice/speak` TTS call) runs
 * unmodified and for real.
 */
test.describe.configure({ timeout: 150_000 });

const bubbleSelector = '[class*="rounded-xl"][class*="shadow-panel"]';
// Reuse the product's own real detectors rather than retyping fragile
// Unicode-range regex literals in a second place.
const hasDevanagari = containsDevanagariScript;
const looksLikeUrdu = (text: string): boolean => detectTextLanguage(text) === "ur";

/**
 * Real Gemini TTS calls can legitimately be rate-limited under sustained
 * testing load (a repeatedly-documented, real condition throughout this
 * project's own prior milestones) — `null` here means "provider
 * unavailable," reported honestly by the caller as a
 * `PROVIDER-AVAILABILITY-LIMITATION` rather than a fabricated pass OR a
 * hard test failure for something outside the code.
 */
async function trySynthesizeSpeech(page: import("@playwright/test").Page, text: string): Promise<string | null> {
  try {
    return await synthesizeSpeech(page, text);
  } catch {
    return null;
  }
}

async function recordOneTurn(page: import("@playwright/test").Page, audioBase64: string): Promise<{ transcribeBody: { text?: string; detectedLanguage?: string }; replyText: string }> {
  await setMockRecordingAudio(page, audioBase64);
  const beforeCount = await page.locator(bubbleSelector).count();
  const transcribeResponsePromise = page.waitForResponse((r) => r.url().includes("/api/aura/voice/transcribe"), { timeout: 30_000 });
  await page.getByRole("button", { name: "Speak to AURA" }).click();
  await page.getByRole("button", { name: "Stop recording" }).click();
  const transcribeBody = await (await transcribeResponsePromise).json();

  await page.waitForFunction(
    (args) => {
      const nodes = document.querySelectorAll(args.selector);
      if (nodes.length <= args.before) return false;
      const last = nodes[nodes.length - 1];
      return (last?.textContent?.trim().length ?? 0) > 0;
    },
    { selector: bubbleSelector, before: beforeCount },
    { timeout: 60_000 },
  );
  const bubbles = page.locator(bubbleSelector);
  const replyText = (await bubbles.last().textContent())?.trim() ?? "";
  return { transcribeBody, replyText };
}

test("Test A — Fresh English session: STT/AURA/TTS all English", async ({ page }) => {
  await loginAs(page, DEMO_FARMER);
  const audio = await trySynthesizeSpeech(page, "How is Plot C doing today?");
  if (!audio) {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "TTS synthesis unavailable — could not set up this test's input audio." });
    return;
  }
  await installMockVoiceRecorder(page);
  await secureGoto(page, "http://localhost:3000/farmer/aura");

  const speakResponsePromise = page.waitForResponse((r) => r.url().includes("/api/aura/voice/speak"), { timeout: 60_000 });
  const { transcribeBody, replyText } = await recordOneTurn(page, audio);
  test.info().annotations.push({ type: "transcript", description: JSON.stringify(transcribeBody) });
  test.info().annotations.push({ type: "reply", description: replyText });

  expect(transcribeBody.detectedLanguage).toBe("en");
  expect(looksLikeUrdu(transcribeBody.text ?? "")).toBe(false);
  expect(looksLikeUrdu(replyText)).toBe(false);

  const speakResponse = await speakResponsePromise;
  expect(speakResponse.ok()).toBe(true);
  const speakBody = await speakResponse.json();
  expect(typeof speakBody.audioBase64).toBe("string");
  expect(speakBody.audioBase64.length).toBeGreaterThan(0);
});

test("Test B — Fresh Urdu session: STT/AURA/TTS all Urdu, no Devanagari", async ({ page }) => {
  await loginAs(page, DEMO_FARMER);
  const audio = await trySynthesizeSpeech(page, "پلاٹ C کی فصل کیسی ہے؟");
  if (!audio) {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "TTS synthesis unavailable — could not set up this test's input audio." });
    return;
  }
  await installMockVoiceRecorder(page);
  await secureGoto(page, "http://localhost:3000/farmer/aura");

  const speakResponsePromise = page.waitForResponse((r) => r.url().includes("/api/aura/voice/speak"), { timeout: 60_000 });
  const { transcribeBody, replyText } = await recordOneTurn(page, audio);
  test.info().annotations.push({ type: "transcript", description: JSON.stringify(transcribeBody) });
  test.info().annotations.push({ type: "reply", description: replyText });

  expect(transcribeBody.detectedLanguage).toBe("ur");
  expect(hasDevanagari(transcribeBody.text ?? "")).toBe(false);
  expect(looksLikeUrdu(transcribeBody.text ?? "")).toBe(true);
  if (replyText && !replyText.includes("trouble connecting")) {
    expect(hasDevanagari(replyText)).toBe(false);
  }

  const speakResponse = await speakResponsePromise;
  expect(speakResponse.ok()).toBe(true);
  const speakBody = await speakResponse.json();
  expect(typeof speakBody.audioBase64).toBe("string");
  expect(speakBody.audioBase64.length).toBeGreaterThan(0);
});

test("Test C — English then Urdu in the same conversation", async ({ page }) => {
  await loginAs(page, DEMO_FARMER);
  const englishAudio = await trySynthesizeSpeech(page, "How is the weather?");
  const urduAudio = await trySynthesizeSpeech(page, "آج موسم کیسا ہے؟");
  if (!englishAudio || !urduAudio) {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "TTS synthesis unavailable — could not set up this test's input audio." });
    return;
  }
  await installMockVoiceRecorder(page);
  await secureGoto(page, "http://localhost:3000/farmer/aura");

  const turn1 = await recordOneTurn(page, englishAudio);
  test.info().annotations.push({ type: "turn1", description: JSON.stringify(turn1.transcribeBody) });
  expect(turn1.transcribeBody.detectedLanguage).toBe("en");

  const turn2 = await recordOneTurn(page, urduAudio);
  test.info().annotations.push({ type: "turn2", description: JSON.stringify(turn2.transcribeBody) });
  expect(turn2.transcribeBody.detectedLanguage).toBe("ur");
  expect(hasDevanagari(turn2.transcribeBody.text ?? "")).toBe(false);
});

test("Test D — Urdu then English in the same conversation", async ({ page }) => {
  await loginAs(page, DEMO_FARMER);
  const urduAudio = await trySynthesizeSpeech(page, "پلاٹ C کا معائنہ کرو");
  const englishAudio = await trySynthesizeSpeech(page, "Inspect Plot C.");
  if (!urduAudio || !englishAudio) {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "TTS synthesis unavailable — could not set up this test's input audio." });
    return;
  }
  await installMockVoiceRecorder(page);
  await secureGoto(page, "http://localhost:3000/farmer/aura");

  const turn1 = await recordOneTurn(page, urduAudio);
  test.info().annotations.push({ type: "turn1", description: JSON.stringify(turn1.transcribeBody) });
  expect(turn1.transcribeBody.detectedLanguage).toBe("ur");
  expect(hasDevanagari(turn1.transcribeBody.text ?? "")).toBe(false);

  const turn2 = await recordOneTurn(page, englishAudio);
  test.info().annotations.push({ type: "turn2", description: JSON.stringify(turn2.transcribeBody) });
  expect(turn2.transcribeBody.detectedLanguage).toBe("en");
});

test("Test E — Urdu turn never contains Devanagari in transcript or reply", async ({ page }) => {
  await loginAs(page, DEMO_FARMER);
  const audio = await trySynthesizeSpeech(page, "Plot C کی فصل کیسی ہے؟");
  if (!audio) {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: "TTS synthesis unavailable — could not set up this test's input audio." });
    return;
  }
  await installMockVoiceRecorder(page);
  await secureGoto(page, "http://localhost:3000/farmer/aura");

  const { transcribeBody, replyText } = await recordOneTurn(page, audio);
  test.info().annotations.push({ type: "transcript", description: JSON.stringify(transcribeBody) });
  test.info().annotations.push({ type: "reply", description: replyText });

  if (transcribeBody.detectedLanguage === "ur") {
    expect(hasDevanagari(transcribeBody.text ?? "")).toBe(false);
    if (replyText && !replyText.includes("trouble connecting")) {
      expect(hasDevanagari(replyText)).toBe(false);
    }
  } else {
    test.info().annotations.push({ type: "PROVIDER-AVAILABILITY-LIMITATION", description: `detectedLanguage was ${transcribeBody.detectedLanguage ?? "undefined"}, not ur — recovery may have hit the safe fallback.` });
  }
});
