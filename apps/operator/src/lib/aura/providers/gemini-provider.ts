import "server-only";

import type { AuraMessage, ProviderConnectionStatus } from "../types";
import type { AIProvider, ChatOptions, ProviderUsage } from "./provider";
import { ProviderTemporaryError } from "./provider";
import { GEMINI_META } from "./provider-meta";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY;
}

// Reassures the operator that the deterministic command
// system (which doesn't need Gemini at all) is unaffected, rather than a
// bare technical "set an env var" instruction. Never includes the key
// itself, a stack trace, or any other credential — this is the exact string
// surfaced to the chat UI when the key is absent.
const MISSING_KEY_MESSAGE =
  "AI reasoning is currently unavailable — Gemini isn't configured yet. The deterministic AURA commands (sensor/plot/mission/fleet queries and actions) are still fully available.";

interface GeminiContentPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiContentPart[];
}

/**
 * Gemini has no "system" role in `contents` — system messages are pulled
 * out into a separate `systemInstruction`.
 *
 * Extended
 * (not duplicated) to attach an `inline_data` part whenever a message
 * carries `AuraMessage.image` (see that field's own doc comment in
 * `types.ts`), exactly matching Gemini's own multimodal `generateContent`
 * request shape. Every one of this file's four Gemini-calling functions
 * (`chat`/`streamChat`/`chatWithApiKey`/`streamWithApiKey`) already funnels
 * through this one function — none of them needed a separate "image"
 * variant. A message's `parts` array always has at least the text part
 * (the canonical request always carries real, non-empty text — either the
 * Farmer's own question or `DEFAULT_IMAGE_ANALYSIS_QUESTION`, substituted
 * client-side before the request is ever built), with the image part
 * appended after it when present.
 */
function toGeminiPayload(messages: AuraMessage[], temperature: number) {
  const systemText = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");

  const contents: GeminiContent[] = messages
    .filter((message) => message.role !== "system")
    .map((message) => {
      const parts: GeminiContentPart[] = [{ text: message.content }];
      if (message.image) {
        parts.push({ inline_data: { mime_type: message.image.mimeType, data: message.image.dataBase64 } });
      }
      return { role: message.role === "assistant" ? "model" : "user", parts };
    });

  return {
    contents,
    ...(systemText ? { systemInstruction: { role: "user", parts: [{ text: systemText }] } } : {}),
    generationConfig: { temperature },
  };
}

async function fetchWithRetry(url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
    const combinedSignal = signal ? anySignal([signal, timeoutController.signal]) : timeoutController.signal;

    try {
      const response = await fetch(url, { ...init, signal: combinedSignal });
      clearTimeout(timeout);
      if (response.ok) return response;
      if (response.status < 500 || attempt === MAX_RETRIES) return response;
      lastError = new Error(`Gemini responded ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (signal?.aborted || attempt === MAX_RETRIES) break;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("Gemini request failed");
}

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      break;
    }
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return controller.signal;
}

class GeminiProvider implements AIProvider {
  readonly id = "gemini" as const;
  readonly meta = GEMINI_META;

  async getStatus(): Promise<ProviderConnectionStatus> {
    const key = apiKey();
    if (!key) return "not-configured";

    try {
      const response = await fetchWithRetry(`${GEMINI_API_BASE}/models?key=${key}`, { method: "GET" });
      return response.ok ? "connected" : "error";
    } catch {
      return "error";
    }
  }

  async chat({ model, temperature, messages, signal }: ChatOptions): Promise<string> {
    const key = apiKey();
    if (!key) throw new Error(MISSING_KEY_MESSAGE);

    const response = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toGeminiPayload(messages, temperature)),
      },
      signal,
    );

    if (!response.ok) {
      throw new Error(`Gemini request failed (${response.status}): ${await safeErrorText(response)}`);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
    return text ?? "";
  }

  async *streamChat({ model, temperature, messages, signal }: ChatOptions): AsyncGenerator<string, void, unknown> {
    const key = apiKey();
    if (!key) throw new Error(MISSING_KEY_MESSAGE);

    const response = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toGeminiPayload(messages, temperature)),
      },
      signal,
    );

    if (!response.ok || !response.body) {
      throw new Error(`Gemini stream failed (${response.status}): ${await safeErrorText(response)}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const text = parsed?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
          if (text) yield text;
        } catch {
          // Ignore a partial/malformed SSE chunk — the next chunk continues the stream.
        }
      }
    }
  }
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "unknown error";
  }
}

export const geminiProvider = new GeminiProvider();

/**
 * Everything below is
 * NEW, purely additive, and never called by the legacy singleton `chat()`/
 * `streamChat()` methods above (those are untouched — Part 12/14's own
 * "existing behavior must continue to work" rule) or by `chat-router.ts`.
 * It exists so the new `router/` package can support MULTIPLE independent
 * Gemini endpoints (Part 4 — e.g. `gemini-1`/`gemini-2`, each its own env
 * var/model), which the old one-Gemini-singleton design can't express, and
 * so a Gemini failure is finally classified into the same
 * `ProviderTemporaryError`/`ProviderFailureReason` vocabulary Groq/
 * OpenRouter already use (previously a genuine gap: the legacy `chat()`/
 * `streamChat()` above always throw a plain `Error`, which `chat-router.ts`
 * treats as immediately fatal/non-fallback-eligible — harmless there only
 * because Gemini has always been LAST in that particular chain; the new
 * router can place a Gemini endpoint anywhere, so this had to be fixed for
 * Gemini to be a safe, real member of an arbitrary chain).
 */

/**
 * Gemini's own token-accounting shape (`usageMetadata`), confirmed
 * against real responses using
 * `GEMINI_2_API_KEY`/`GEMINI_3_API_KEY`. One genuine, worth-documenting
 * nuance found live: a reasoning-capable Flash model (e.g. gemini-3.6-flash,
 * gemini-3.5-flash) reports a separate `thoughtsTokenCount` that is included
 * in `totalTokenCount` but NOT in `candidatesTokenCount` — so
 * `completionTokens` here (mapped straight from `candidatesTokenCount`) is
 * the model's real VISIBLE output length, while `totalTokens` (straight from
 * `totalTokenCount`, Gemini's own already-correct sum) can legitimately be
 * larger than `promptTokens + completionTokens` for those models — that's
 * real, billed, hidden reasoning cost, not a bug in this mapping. A
 * non-reasoning model (gemini-3.1-flash-lite, live-confirmed) reports no
 * `thoughtsTokenCount` at all and its three numbers reconcile exactly.
 */
function extractGeminiUsage(data: unknown): ProviderUsage | null {
  if (typeof data !== "object" || data === null || !("usageMetadata" in data)) return null;
  const usage = (data as { usageMetadata?: unknown }).usageMetadata;
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as { promptTokenCount?: unknown; candidatesTokenCount?: unknown; totalTokenCount?: unknown; cachedContentTokenCount?: unknown };
  const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
  return {
    promptTokens: num(u.promptTokenCount),
    completionTokens: num(u.candidatesTokenCount),
    totalTokens: num(u.totalTokenCount),
    cachedTokens: num(u.cachedContentTokenCount),
  };
}

/** Mirrors `groq-provider.ts`'s own `parseRetryAfterSeconds` — see that file's doc comment. */
function parseRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Mirrors `groq-provider.ts`'s/`openrouter-provider.ts`'s own `throwForFailedResponse` shape exactly, so all three providers feed the router the same failure vocabulary. */
function classifyGeminiFailure(status: number, bodyText: string, retryAfterSeconds?: number | null): ProviderTemporaryError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ProviderTemporaryError(`Gemini rejected the configured API key (${status}).`, "gemini", "authentication_error");
  }
  if (status === 429) {
    return new ProviderTemporaryError(
      "Gemini rate-limited this request (429).",
      "gemini",
      lower.includes("quota") ? "quota_exceeded" : "rate_limit",
      retryAfterSeconds ?? undefined,
    );
  }
  if (status === 404) {
    return new ProviderTemporaryError(`Gemini model not available on this key (${status}).`, "gemini", "model_unavailable");
  }
  if (status >= 500) {
    return new ProviderTemporaryError(`Gemini is temporarily unavailable (${status}).`, "gemini", "temporary_error");
  }
  if (lower.includes("context") || lower.includes("token")) {
    return new ProviderTemporaryError("Gemini rejected this request as too large.", "gemini", "context_limit");
  }
  return new ProviderTemporaryError(`Gemini request failed (${status}).`, "gemini", "invalid_request");
}

/**
 * Non-streaming only (the Router Test panel — Part 18 — never needs
 * streaming) — takes an EXPLICIT api key (resolved by the caller from
 * whichever env var that specific endpoint config names) rather than
 * reading `process.env.GEMINI_API_KEY` internally, so `gemini-1` and
 * `gemini-2` can hold genuinely different keys. Reuses `toGeminiPayload`/
 * `fetchWithRetry`/`GEMINI_API_BASE` above — no duplicated request-shaping.
 */
export async function chatWithApiKey(
  apiKey: string,
  model: string,
  temperature: number,
  messages: AuraMessage[],
  signal?: AbortSignal,
): Promise<{ text: string; usage: ProviderUsage | null }> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toGeminiPayload(messages, temperature)) },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini request failed.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    throw classifyGeminiFailure(response.status, await safeErrorText(response), parseRetryAfterSeconds(response));
  }

  // `response.json()` reads the REST of the
  // response body, which can still be in flight when the router's own
  // `withRouterTimeout` (or this file's own `fetchWithRetry` internal
  // timeout) aborts — a real, live-observed failure mode (found and fixed
  // identically in `groq-provider.ts`/`openrouter-provider.ts` this same
  // phase): `fetchWithRetry` above only guards the INITIAL `fetch()` call,
  // not this change. Before this fix, that abort's raw `DOMException`
  // propagated all the way up UNWRAPPED, so `aura-router.ts`'s own catch
  // (which only recognizes `ProviderTemporaryError`) fell back to its
  // generic "unknown failure" classification — `invalid_request`, which
  // `isFallbackEligible` treats as NEVER fallback-eligible, incorrectly
  // halting the entire chain on what was really just a timeout.
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini response could not be read.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
  const text =
    (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("") ?? "";
  return { text, usage: extractGeminiUsage(data) };
}

/**
 * The streaming twin of
 * `chatWithApiKey` above, for the new router's `AuraProviderAdapter.stream`.
 * Mirrors the legacy singleton's own `streamChat()` SSE-parsing loop
 * exactly (same endpoint shape, same `data:` line parsing) — no
 * duplicated protocol logic, just parameterized by an explicit key the
 * same way `chatWithApiKey` already is, so `gemini-1`/`gemini-2`/`gemini-3`
 * each stream with their own real key. `onDelta` is called once per text
 * chunk as it arrives; the returned `usage` is whichever `usageMetadata`
 * the LAST chunk that included one reported (Gemini's SSE stream reports
 * cumulative usage on trailing chunks, mirrored here rather than assumed —
 * live-verified this change
 * Result section).
 */
export async function streamWithApiKey(
  apiKey: string,
  model: string,
  temperature: number,
  messages: AuraMessage[],
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ usage: ProviderUsage | null }> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(toGeminiPayload(messages, temperature)) },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini request failed.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    throw classifyGeminiFailure(response.status, await safeErrorText(response), parseRetryAfterSeconds(response));
  }
  if (!response.body) {
    throw new ProviderTemporaryError("Gemini returned an empty response body.", "gemini", "temporary_error");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage: ProviderUsage | null = null;

  // Same gap as `chatWithApiKey`'s own
  // `response.json()` fix above, for this streaming path's `reader.read()`
  // loop: an abort arriving WHILE this loop is still reading (the router's
  // own timeout, or this file's `fetchWithRetry`-internal one, firing
  // mid-stream) is a real, live-observed failure mode whose raw
  // `DOMException` must become a proper `ProviderTemporaryError`, never
  // propagate unwrapped.
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice("data:".length).trim();
        if (!payload || payload === "[DONE]") continue;

        try {
          const parsed = JSON.parse(payload);
          const text = parsed?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text ?? "").join("");
          if (text) onDelta(text);
          const chunkUsage = extractGeminiUsage(parsed);
          if (chunkUsage) usage = chunkUsage;
        } catch {
          // Ignore a partial/malformed SSE chunk — the next chunk continues the stream.
        }
      }
    }
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini stream was interrupted.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }

  return { usage };
}

/**
 * AURA Multi-Key, Multi-Model & Capability-Aware
 * Provider Pool — TEXT_TO_SPEECH via Gemini's `generateContent`
 * (the SAME endpoint shape `chatWithApiKey` already calls, not a different
 * transport), requesting an audio response instead of text via
 * `generationConfig.responseModalities: ["AUDIO"]` plus a
 * `speechConfig.voiceConfig.prebuiltVoiceConfig` — live-verified this change
 * against `gemini-3.1-flash-tts-preview` (real 200 OK, real
 * `audio/l16; rate=24000; channels=1` inline bytes returned for a real test
 * phrase — see `model-catalog.ts`'s own dated note). `voiceName` is fixed to
 * one of Gemini's own documented prebuilt voices ("Kore") — this change adds
 * no per-Farmer voice SELECTION (out of scope per Part 24: "prepare routing
 * infrastructure," not the Farmer-facing voice experience itself).
 */
/**
 * Live-inspected byte-for-byte this change (not assumed): Gemini's TTS
 * response always declares `mimeType: "audio/L16;rate=<N>;channels=<N>"`
 * (verified against a real response this change: `audio/l16; rate=24000;
 * channels=1`) and the `inlineData.data` bytes are RAW, HEADERLESS 16-bit
 * signed little-endian PCM — confirmed by decoding a real response and
 * checking the first bytes carry no `RIFF`/`OggS`/MP3 signature at all.
 * `audio/L16` is a real, registered MIME type (RFC 2586) meant for
 * RTP/telephony contexts — no browser's `<audio>`/`Audio()` element has a
 * native decoder for it as a playback `src`. An earlier version returned these bytes
 * to the Farmer completely unmodified with that same `audio/L16` mimeType:
 * the HTTP round trip succeeded end-to-end (200, non-empty bytes), so every
 * automated check that stopped at "did the request succeed" reported
 * PASS — but the browser silently failed to decode/play a format it has no
 * codec for, which is exactly why a real human test heard nothing despite
 * the automated test's own "success."
 *
 * The fix wraps the raw PCM in a minimal, standard 44-byte WAV (RIFF/WAVE)
 * header before this function ever returns — `audio/wav` is universally
 * playable by every browser's `<audio>` element, and a WAV container
 * around already-PCM audio requires no re-encoding/re-sampling/external
 * library, just the standard fixed header layout (Step 5's own "smallest
 * safe conversion" — nothing more).
 */
const PCM_MIME_PATTERN = /^audio\/l16\b/i;

function parsePcmParams(mimeType: string): { sampleRate: number; channels: number } {
  const rateMatch = mimeType.match(/rate=(\d+)/i);
  const channelsMatch = mimeType.match(/channels=(\d+)/i);
  return {
    // Gemini's own documented TTS default is 24kHz mono — used only as a
    // fallback if a future response ever omits the parameter, never as a
    // silent override of a value the response DID provide.
    sampleRate: rateMatch ? Number(rateMatch[1]) : 24000,
    channels: channelsMatch ? Number(channelsMatch[1]) : 1,
  };
}

/** A minimal, standard 44-byte RIFF/WAVE header wrapped around already-decoded 16-bit PCM samples — no re-encoding, no external library, exactly the "smallest safe server-side conversion" the raw-PCM format requires. */
function wrapPcmAsWav(pcm: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // audio format: 1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function synthesizeSpeechWithApiKey(
  apiKey: string,
  model: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ audioBase64: string; mimeType: string; usage: ProviderUsage | null; wrapMs?: number }> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${GEMINI_API_BASE}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
          },
        }),
      },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini speech request failed.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    throw classifyGeminiFailure(response.status, await safeErrorText(response), parseRetryAfterSeconds(response));
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Gemini speech response could not be read.",
      "gemini",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }

  const part = (data as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] })?.candidates?.[0]?.content
    ?.parts?.[0];
  const inline = part?.inlineData;
  if (!inline?.data || !inline.mimeType) {
    throw new ProviderTemporaryError("Gemini did not return audio for this request.", "gemini", "temporary_error");
  }

  // "do not assume HTTP 200 = success": decode and
  // check the ACTUAL byte length before ever accepting this as a real
  // result. An empty/near-empty decode (malformed base64, or Gemini
  // technically responding but with a zero-length clip) is treated exactly
  // like a provider failure — fallback-eligible, never silently returned
  // as a "successful" empty/broken audio payload.
  let decoded: Buffer;
  try {
    decoded = Buffer.from(inline.data, "base64");
  } catch {
    throw new ProviderTemporaryError("Gemini returned malformed audio data.", "gemini", "temporary_error");
  }
  if (decoded.length === 0) {
    throw new ProviderTemporaryError("Gemini returned empty audio data.", "gemini", "temporary_error");
  }

  // Part "ROOT CAUSE" above — Gemini's TTS output is raw, headerless PCM
  // (`audio/L16`), which no browser can play as-is. Wrap it in a real WAV
  // container and report the format the bytes now ACTUALLY are — never
  // hand the Farmer's browser a MIME type that doesn't match the bytes.
  if (PCM_MIME_PATTERN.test(inline.mimeType)) {
    // Isolates the WAV-wrap step's own cost from Gemini's own
    // network/generation time (already captured by the router's own
    // per-attempt `latencyMs`), so a slow TTS reply can be attributed
    // correctly rather than assumed to be "the provider."
    const wrapStart = performance.now();
    const { sampleRate, channels } = parsePcmParams(inline.mimeType);
    const wav = wrapPcmAsWav(decoded, sampleRate, channels);
    const wrapMs = performance.now() - wrapStart;
    return { audioBase64: wav.toString("base64"), mimeType: "audio/wav", usage: extractGeminiUsage(data), wrapMs };
  }

  // Some other, already-container-wrapped format (not observed from this
  // model in practice, but handled honestly rather than assumed away) —
  // pass the real bytes/mimeType through unmodified.
  return { audioBase64: decoded.toString("base64"), mimeType: inline.mimeType, usage: extractGeminiUsage(data) };
}
