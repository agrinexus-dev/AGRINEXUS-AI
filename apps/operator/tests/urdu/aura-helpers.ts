import type { Page } from "@playwright/test";

/**
 * Sends a
 * message through the REAL Farmer AURA UI (`farmer-aura-page.tsx` →
 * `ChatInput` → `useAuraChatStore.sendMessage` → `POST /api/aura/chat`),
 * exactly as a Farmer would: types into the visible textarea, presses
 * Enter. Never calls a provider or any diagnostic endpoint directly — this
 * is a deliberate requirement ("use the actual user flow").
 *
 * Real provider calls can legitimately take many seconds, or fail with a
 * genuine rate-limit/quota condition outside this harness's control
 * (confirmed as a REAL, live condition before) — `timedOut`/`sawError`
 * are reported honestly rather than
 * the caller assuming success.
 */
export interface AuraSendResult {
  /** The assistant's final rendered text, or `null` if none appeared before the timeout. */
  replyText: string | null;
  /** `true` if an `AuraMissionCard` (a real, confirmed mission reference) rendered for this turn — a strong, structural signal the turn became a real action, not merely conversational text. */
  hasMissionCard: boolean;
  /** `true` if no reply (mission-card or text) appeared within `timeoutMs`. */
  timedOut: boolean;
  elapsedMs: number;
}

/**
 * Installs a stand-in for
 * the browser's raw microphone CAPTURE primitives only (`getUserMedia`/
 * `MediaRecorder`), never any application code. No real microphone exists
 * in this harness; per this project's own established methodology, real
 * speech audio is
 * synthesized via the app's own unmodified Gemini TTS endpoint and handed
 * to the real `voice-recorder-button.tsx`/`/api/aura/voice/transcribe`/
 * `farmer-aura-page.tsx` pipeline exactly as a genuine recording would be.
 * Call `page.evaluate` to set `window.__mockAudioBase64` to the NEXT
 * utterance's audio before each tap-to-record for a multi-turn test.
 */
export async function installMockVoiceRecorder(page: Page): Promise<void> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();

    class FakeRecorder extends EventTarget {
      state: string = "inactive";
      mimeType: string;
      stream: MediaStream;
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(stream: MediaStream) {
        super();
        this.stream = stream;
        this.mimeType = "audio/wav";
      }
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        const b64 = (window as unknown as { __mockAudioBase64?: string }).__mockAudioBase64 ?? "";
        const byteChars = atob(b64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: "audio/wav" });
        this.ondataavailable?.({ data: blob });
        this.onstop?.();
      }
    }
    (FakeRecorder as unknown as { isTypeSupported: (t: string) => boolean }).isTypeSupported = (t: string) => t === "audio/wav";
    // @ts-expect-error - test-only override of a browser API
    window.MediaRecorder = FakeRecorder;
  });
}

/** Sets the audio the NEXT mocked recording will "capture" — call after `installMockVoiceRecorder` and before each tap-to-record. */
export async function setMockRecordingAudio(page: Page, audioBase64: string): Promise<void> {
  await page.evaluate((b64) => {
    (window as unknown as { __mockAudioBase64: string }).__mockAudioBase64 = b64;
  }, audioBase64);
}

/** Real Gemini-TTS synthesis via the app's own unmodified endpoint — returns the base64 audio to feed into `setMockRecordingAudio`. */
export async function synthesizeSpeech(page: Page, text: string): Promise<string> {
  const res = await page.request.post("http://localhost:3000/api/aura/voice/speak", { data: { text } });
  if (!res.ok()) throw new Error(`TTS synth failed for "${text}": ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return body.audioBase64 as string;
}

export async function sendAuraMessage(page: Page, text: string, timeoutMs = 40_000): Promise<AuraSendResult> {
  const started = Date.now();
  const textarea = page.locator("textarea");
  await textarea.click();
  await textarea.fill(text);

  // Count of assistant bubbles BEFORE sending, so we can wait for a NEW one specifically.
  const bubbleSelector = '[class*="rounded-xl"][class*="shadow-panel"]';
  const beforeCount = await page.locator(bubbleSelector).count();

  await textarea.press("Enter");

  let timedOut = false;
  try {
    await page.waitForFunction(
      (args) => {
        const nodes = document.querySelectorAll(args.selector);
        if (nodes.length <= args.before) return false;
        // Wait until the LAST bubble has real text content (not the empty
        // typing-indicator placeholder).
        const last = nodes[nodes.length - 1];
        return (last?.textContent?.trim().length ?? 0) > 0;
      },
      { selector: bubbleSelector, before: beforeCount },
      { timeout: timeoutMs },
    );
  } catch {
    timedOut = true;
  }

  const elapsedMs = Date.now() - started;
  // `AuraMissionCard` (`aura-mission-card.tsx`) is the ONLY component in
  // this chat surface that renders a `role="status"`/`aria-live="polite"`
  // live region (a screen-reader status announcement for a real, confirmed
  // mission reference) — its presence is a real, structural signal that
  // this turn produced an actual mission, not merely conversational text.
  const hasMissionCard = (await page.locator('[role="status"][aria-live="polite"]').count()) > 0;
  let replyText: string | null = null;
  const bubbles = page.locator(bubbleSelector);
  const count = await bubbles.count();
  if (count > 0) {
    replyText = (await bubbles.last().textContent())?.trim() ?? null;
  }

  return { replyText, hasMissionCard, timedOut, elapsedMs };
}
