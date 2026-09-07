import "server-only";

import type { AuraMessage, ProviderConnectionStatus } from "../types";
import { normalizeDetectedLanguage, type ConversationLanguage } from "../voice/language-detection";
import type { AIProvider, ChatOptions, ProviderUsage } from "./provider";
import { ProviderTemporaryError } from "./provider";
import { GROQ_META } from "./provider-meta";

/**
 * Groq, added as a second real AI provider (alongside
 * OpenRouter) and as the automatic fallback target when OpenRouter fails
 * with a temporary/recoverable error (see `app/api/aura/chat/route.ts`).
 * Groq's API is OpenAI-compatible chat completions, the exact same shape
 * `openrouter-provider.ts` already speaks — this file deliberately mirrors
 * that one's structure (retry/timeout/error-classification) rather than
 * inventing a different pattern for a second provider.
 */

const GROQ_API_BASE = "https://api.groq.com/openai/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function apiKey(): string | undefined {
  return process.env.GROQ_API_KEY;
}

/** Same reasoning as `openrouter-provider.ts`'s `MISSING_KEY_MESSAGE` — reassures the operator the deterministic command system is unaffected, never includes the key itself. */
const MISSING_KEY_MESSAGE =
  "AI reasoning is currently unavailable — Groq isn't configured yet. The deterministic AURA commands (sensor/plot/mission/fleet queries and actions) are still fully available.";

function toGroqMessages(messages: AuraMessage[]): { role: string; content: string }[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: message.content,
  }));
}

function headers(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
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
      // Only 5xx (transient server-side failures) are retried — 401/403/429/other 4xx are
      // caller/config problems that a retry can't fix, so surface them immediately.
      if (response.ok || response.status < 500 || attempt === MAX_RETRIES) return response;
      lastError = new Error(`Groq responded ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (signal?.aborted || attempt === MAX_RETRIES) break;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
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

/** Never includes the key or raw response body verbatim (which could echo request headers back). Takes the body text already read by the caller (a `Response` body can only be consumed once). */
function describeHttpError(response: Response, bodyText: string): string {
  const parsedMessage = extractErrorMessage(bodyText);

  switch (response.status) {
    case 401:
      return "Groq rejected the configured API key (401 Unauthorized) — the key may be invalid or revoked.";
    case 403:
      return "Groq denied this request (403 Forbidden) — the configured API key may lack access to this model.";
    case 429:
      return "Groq rate-limited this request (429 Too Many Requests) — please try again shortly.";
    default:
      if (response.status >= 500) {
        return `Groq is temporarily unavailable (${response.status}) — please try again shortly.`;
      }
      return `Groq request failed (${response.status})${parsedMessage ? `: ${parsedMessage}` : ""}`;
  }
}

/**
 * The real Groq TPM/context-length ceiling seen on context-heavy AURA
 * requests. Groq reports this as a 413
 * ("Request too large") or a 400 whose message mentions tokens/context/
 * length — never a distinct dedicated status code — so the body text has to
 * be inspected. Classified as `ProviderTemporaryError` (fallback-eligible),
 * NOT a plain `Error`: a different provider's context window/rate limit is
 * a genuinely separate constraint, so it deserves a real attempt, exactly
 * as Part 19 requires ("do not silently remove context to make Groq work" —
 * the fix is a different provider, never a smaller context).
 */
function isContextOrRateLimitBody(bodyText: string): "context_limit" | "quota_exceeded" | null {
  const lower = bodyText.toLowerCase();
  // This previously read `lower.includes("context")
  // || lower.includes("token") && (lower.includes("reduce") ||...)`. Because
  // `&&` binds tighter than `||`, that condition was really `"context" present
  // OR ("token" present AND a length-phrase present)` — so a real, live-observed
  // Groq 400 body ("Please reduce the length of the messages or completion.",
  // seen on the `allam-2-7b` model with this app's real, context-heavy AURA
  // requests) contains NEITHER "context" NOR "token" and slipped through
  // undetected, falling through to a generic `invalid_request` classification
  // elsewhere — which `aura-router.ts`'s `isFallbackEligible` treats as NEVER
  // fallback-eligible, incorrectly halting the entire chain before a
  // larger-context-window endpoint further down (e.g. a Gemini/OpenRouter TEXT
  // entry) ever got a chance, even though a genuinely different provider's
  // context window is exactly the "different constraint that deserves a real
  // attempt" this function's own doc comment already describes. Each phrase
  // below is now its own independent trigger (matching what the doc comment
  // always described this function as doing), not gated behind another one.
  if (lower.includes("context") || lower.includes("token") || lower.includes("reduce") || lower.includes("too large") || lower.includes("maximum")) {
    return "context_limit";
  }
  if (lower.includes("quota") || lower.includes("insufficient")) return "quota_exceeded";
  return null;
}

/**
 * A real `Retry-After` header, when the
 * provider actually sent one (an integer number of seconds, per the HTTP
 * spec's most common form — the HTTP-date form is deliberately not parsed
 * here since neither Groq nor OpenRouter has been observed sending it).
 * `null` when absent or unparseable — never a guessed value.
 */
function parseRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** Same split as `openrouter-provider.ts`'s own `throwForFailedResponse`: 429/413/5xx are fallback-eligible (each with its own diagnostic reason — Part 22), everything else is a plain (never-fallback) `Error`. */
async function throwForFailedResponse(response: Response): Promise<never> {
  const bodyText = await safeErrorText(response);
  const message = describeHttpError(response, bodyText);
  const bodyReason = isContextOrRateLimitBody(bodyText);

  if (response.status === 413 || bodyReason === "context_limit") {
    throw new ProviderTemporaryError(message, "groq", "context_limit");
  }
  if (response.status === 429) {
    throw new ProviderTemporaryError(message, "groq", bodyReason === "quota_exceeded" ? "quota_exceeded" : "rate_limit", parseRetryAfterSeconds(response) ?? undefined);
  }
  // "model unavailable" is explicitly listed as a
  // fallback condition: a 404 here means the CONFIGURED MODEL NAME doesn't
  // exist on this account right now (a real, previously-hit failure mode —
  // see GROQ_META's own doc comment on the "model does not exist"
  // 404), not that the request itself was invalid. A different provider/
  // model can genuinely serve it, unlike a 401/403 credential problem.
  if (response.status === 404) {
    throw new ProviderTemporaryError(message, "groq", "model_unavailable");
  }
  if (response.status >= 500) {
    throw new ProviderTemporaryError(message, "groq", "temporary_error");
  }
  throw new Error(message);
}

function extractErrorMessage(bodyText: string): string | undefined {
  try {
    const parsed = JSON.parse(bodyText);
    const message = parsed?.error?.message;
    return typeof message === "string" ? message : undefined;
  } catch {
    return undefined;
  }
}

async function safeErrorText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "unknown error";
  }
}

/**
 * Groq's `usage`
 * object is OpenAI-compatible: `prompt_tokens`/`completion_tokens`/
 * `total_tokens`, plus `prompt_tokens_details.cached_tokens` for Groq's own
 * automatic prompt caching (verified against Groq's current documentation —
 * automatic, exact-prefix-match, no request configuration required, and
 * currently limited to the `openai/gpt-oss-20b`/`120b`/`safeguard-20b`
 * models — which is exactly what `task-router.ts`'s `CATEGORY_MODEL_TABLE`
 * already routes AURA's conversational path to). A field this app's
 * response doesn't actually contain stays `null`, never `0` — never invent
 * a cache hit/miss count the provider didn't report.
 */
function extractUsage(data: unknown): ProviderUsage | null {
  if (typeof data !== "object" || data === null || !("usage" in data)) return null;
  const usage = (data as { usage?: unknown }).usage;
  if (typeof usage !== "object" || usage === null) return null;
  const u = usage as { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown; prompt_tokens_details?: { cached_tokens?: unknown } };
  const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
  return {
    promptTokens: num(u.prompt_tokens),
    completionTokens: num(u.completion_tokens),
    totalTokens: num(u.total_tokens),
    cachedTokens: num(u.prompt_tokens_details?.cached_tokens),
  };
}

class GroqProvider implements AIProvider {
  readonly id = "groq" as const;
  readonly meta = GROQ_META;

  async getStatus(): Promise<ProviderConnectionStatus> {
    const key = apiKey();
    if (!key) return "not-configured";

    try {
      // Lightweight, low-cost probe — lists models rather than generating content,
      // matching every other provider's own getStatus() convention.
      const response = await fetchWithRetry(`${GROQ_API_BASE}/models`, {
        method: "GET",
        headers: headers(key),
      });
      return response.ok ? "connected" : "error";
    } catch {
      return "error";
    }
  }

  async chat({ model, temperature, messages, signal, onUsage }: ChatOptions): Promise<string> {
    const key = apiKey();
    // Fallback-eligible, not a dead-end plain `Error`: a
    // MISSING Groq key says nothing about whether a sibling provider (e.g.
    // OpenRouter) is configured, so the router should still get a real try.
    if (!key) throw new ProviderTemporaryError(MISSING_KEY_MESSAGE, "groq", "unavailable");
    const { text } = await chatWithGroqApiKey(key, model, temperature, messages, signal, onUsage);
    return text;
  }

  async *streamChat({ model, temperature, messages, signal, onUsage }: ChatOptions): AsyncGenerator<string, void, unknown> {
    const key = apiKey();
    if (!key) throw new ProviderTemporaryError(MISSING_KEY_MESSAGE, "groq", "unavailable");
    yield* streamWithGroqApiKey(key, model, temperature, messages, signal, onUsage);
  }
}

export const groqProvider = new GroqProvider();

/**
 * AURA Multi-Key, Multi-Model & Capability-Aware
 * Provider Pool — everything below is NEW, purely additive
 * (mirrors `gemini-provider.ts`'s own `chatWithApiKey`/`streamWithApiKey`
 * split — see that file's doc comment for the full rationale). Fixes a
 * REAL bug found this change during implementation: `endpoint-registry.ts`'s
 * `createAdapterForEndpoint` previously routed every Groq endpoint through
 * `getProvider("groq")` — this file's own singleton above, whose `chat()`/
 * `streamChat()` always read `process.env.GROQ_API_KEY` internally via
 * `apiKey()`, REGARDLESS of which `credentialEnv` a specific `groq-2`/
 * `groq-3` endpoint actually named. A second configured Groq credential
 * (`GROQ_2_API_KEY`) was therefore silently never actually used — every
 * "independent" Groq endpoint really shared the exact same key, directly
 * contradicting Part 20's own explicit rule ("do NOT accidentally reuse
 * GROQ_API_KEY for every Groq endpoint"). These key-parameterized functions
 * (and `createAdapterForEndpoint`'s new use of them, see `endpoint-
 * registry.ts`) are the fix — genuinely independent credentials per Groq
 * endpoint, exactly as Gemini's multi-key support already worked correctly.
 */
export async function chatWithGroqApiKey(
  key: string,
  model: string,
  temperature: number,
  messages: AuraMessage[],
  signal?: AbortSignal,
  onUsage?: (usage: ProviderUsage) => void,
): Promise<{ text: string; usage: ProviderUsage | null }> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${GROQ_API_BASE}/chat/completions`,
      { method: "POST", headers: headers(key), body: JSON.stringify({ model, messages: toGroqMessages(messages), temperature, stream: false }) },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq request failed.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }

  // See the original `chat()` method's own
  // (now-relocated) doc comment: `response.json()` must be guarded the same
  // way the fetch itself is, so a mid-read abort becomes a real
  // `ProviderTemporaryError` instead of an unwrapped `DOMException`.
  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq response could not be read.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
  const usage = extractUsage(data);
  if (usage) onUsage?.(usage);
  const text = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  return { text: typeof text === "string" ? text : "", usage };
}

export async function* streamWithGroqApiKey(
  key: string,
  model: string,
  temperature: number,
  messages: AuraMessage[],
  signal?: AbortSignal,
  onUsage?: (usage: ProviderUsage) => void,
): AsyncGenerator<string, void, unknown> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      `${GROQ_API_BASE}/chat/completions`,
      {
        method: "POST",
        headers: headers(key),
        body: JSON.stringify({ model, messages: toGroqMessages(messages), temperature, stream: true, stream_options: { include_usage: true } }),
      },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq request failed.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }
  if (!response.body) {
    throw new ProviderTemporaryError("Groq returned an empty response body.", "groq", "temporary_error");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

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
          const usage = extractUsage(parsed);
          if (usage) onUsage?.(usage);
          const text = parsed?.choices?.[0]?.delta?.content;
          if (typeof text === "string" && text) yield text;
        } catch {
          // Ignore a partial/malformed SSE chunk — the next chunk continues the stream.
        }
      }
    }
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq stream was interrupted.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
}

/**
 * SPEECH_TO_TEXT via Groq's real
 * `/audio/transcriptions` endpoint (`multipart/form-data`, NOT the JSON
 * chat-completions shape every other function in this file uses — a
 * genuinely different request shape for a genuinely different operation,
 * per `AuraProviderAdapter.transcribe`'s own doc comment in `router/
 * types.ts`). Live-verified this change against both `whisper-large-v3` and
 * `whisper-large-v3-turbo` with a real WAV file — see `model-catalog.ts`'s
 * dated note.
 */
/**
 * A real bug found and fixed during live
 * verification: Groq's `/audio/transcriptions` endpoint validates the
 * uploaded file's type by the FILENAME's extension, not the multipart
 * part's `Content-Type` header — a plain `"audio"` filename (no extension)
 * produced a live, reproduced 400 ("file must be one of the following
 * types: [flac mp3 mp4 mpeg mpga m4a ogg opus wav webm]") even though the
 * blob's own MIME type was already correctly `audio/wav`. This maps the
 * handful of MIME types this project's own audio-attachment convention
 * (`AuraAudioAttachment`) can realistically carry to a real filename
 * extension Groq accepts; an unrecognized MIME type falls back to `.wav`
 * (the format this project's own Operator test-panel sample generator
 * always produces) rather than failing closed.
 */
function extensionForAudioMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp3") || normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4") || normalized.includes("m4a")) return "m4a";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("opus")) return "opus";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("flac")) return "flac";
  return "wav";
}

/**
 * `language`, an
 * OPTIONAL ISO-639-1 code forwarded as Groq's own documented
 * `/audio/transcriptions` `language` form field. Added after a real,
 * direct call to this exact endpoint (with and without this field, same
 * audio both times) showed Whisper's own auto-detection sometimes
 * transcribes spoken Urdu as Hindi (Devanagari script) instead of Urdu's
 * own Perso-Arabic script — passing `language: "ur"` produced a correct
 * Urdu-script transcript instead. `undefined` omits the field entirely,
 * identical to the pre-existing behavior for English/auto-detected audio.
 *
 * `response_format: "verbose_json"` is Groq/Whisper's
 * own documented request parameter for getting the model's OWN detected
 * language back in the response (the default, unset format returns only
 * `{ text }`, confirmed by audit). This is
 * the SAME single request Whisper always made — no second transcription
 * pass, no second provider call, no model change. Whatever raw string
 * Whisper reports (its own API returns a full language NAME like
 * `"english"`/`"urdu"`, not an ISO code) is normalized through
 * `normalizeDetectedLanguage` (`lib/aura/voice/language-detection.ts`)
 * before it ever leaves this function — an unsupported detection (e.g.
 * Whisper reporting `"hindi"`) becomes `undefined` here, at the source,
 * so nothing downstream ever has the chance to treat a real Whisper
 * detection as a green light to switch the product into a third,
 * unsupported language.
 */
export async function transcribeWithGroqApiKey(
  key: string,
  model: string,
  audio: { mimeType: string; dataBase64: string },
  signal?: AbortSignal,
  language?: string,
): Promise<{ text: string; usage: ProviderUsage | null; detectedLanguage?: ConversationLanguage }> {
  const bytes = Buffer.from(audio.dataBase64, "base64");
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: audio.mimeType }), `audio.${extensionForAudioMimeType(audio.mimeType)}`);
  form.append("model", model);
  form.append("response_format", "verbose_json");
  if (language) form.append("language", language);

  let response: Response;
  try {
    response = await fetchWithRetry(`${GROQ_API_BASE}/audio/transcriptions`, { method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form }, signal);
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq transcription request failed.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "Groq transcription response could not be read.",
      "groq",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
  const text = (data as { text?: unknown })?.text;
  // `verbose_json`'s own `language` field (Whisper's
  // real detected language, a full name like `"english"`/`"urdu"`/
  // `"hindi"`). Normalized immediately (see this function's own doc
  // comment for why) — `undefined` here means either Whisper reported
  // nothing, or reported a language this product doesn't support.
  const rawLanguage = (data as { language?: unknown })?.language;
  const detectedLanguage = normalizeDetectedLanguage(typeof rawLanguage === "string" ? rawLanguage : undefined);
  // Groq's transcription response has no chat-style `usage` object today —
  // never fabricated, always `null` here rather than guessed.
  return { text: typeof text === "string" ? text : "", usage: null, detectedLanguage };
}

/** The model the SERVER uses when it transparently falls back to Groq (the user never re-selects a model for this path, unlike explicitly picking Groq in AURA Settings, which uses `GROQ_META.models[0]` as usual). Configurable via env so a newly-released/renamed Groq model doesn't need a code change; falls back to a currently-supported Groq model name if unset. */
export function fallbackGroqModel(): string {
  return process.env.GROQ_MODEL || GROQ_META.models[0]!;
}
