import "server-only";

import type { AuraMessage, ProviderConnectionStatus } from "../types";
import type { AIProvider, ChatOptions, ProviderUsage } from "./provider";
import { ProviderTemporaryError } from "./provider";
import { OPENROUTER_META } from "./provider-meta";

const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 400;

function apiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

// Mirrors gemini-provider.ts's MISSING_KEY_MESSAGE: reassures
// the operator that the deterministic command system is unaffected, never
// includes the key itself, a stack trace, or any other credential.
const MISSING_KEY_MESSAGE =
  "AI reasoning is currently unavailable — OpenRouter isn't configured yet. The deterministic AURA commands (sensor/plot/mission/fleet queries and actions) are still fully available.";

/** OpenRouter speaks the OpenAI chat-completions format — plain {role, content} pairs, including "system". */
function toOpenRouterMessages(messages: AuraMessage[]): { role: string; content: string }[] {
  return messages.map((message) => ({
    role: message.role === "assistant" ? "assistant" : message.role === "system" ? "system" : "user",
    content: message.content,
  }));
}

function headers(key: string): HeadersInit {
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    // Optional but recommended by OpenRouter for attribution/rate-limit context — no secret data.
    // HTTP header values must be ByteString (Latin-1 only) — an em dash here throws
    // "Cannot convert argument to a ByteString" at request time, so keep this ASCII-only.
    "HTTP-Referer": "https://agrinexus.ai",
    "X-Title": "AgriNexus AI - AURA",
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
      lastError = new Error(`OpenRouter responded ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (signal?.aborted || attempt === MAX_RETRIES) break;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BASE_DELAY_MS * 2 ** attempt));
  }

  throw lastError instanceof Error ? lastError : new Error("OpenRouter request failed");
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

/** Same TPM/context-limit body-text classification `groq-provider.ts` uses — OpenRouter is also OpenAI-compatible and can surface a 400 "context length exceeded" the same way. */
function isContextOrRateLimitBody(bodyText: string): "context_limit" | "quota_exceeded" | null {
  const lower = bodyText.toLowerCase();
  if (lower.includes("context") || (lower.includes("token") && (lower.includes("reduce") || lower.includes("too large") || lower.includes("maximum")))) {
    return "context_limit";
  }
  if (lower.includes("quota") || lower.includes("insufficient")) return "quota_exceeded";
  return null;
}

/** Maps an OpenRouter HTTP failure to a clear, user-facing message — never includes the key or raw response body verbatim (which could echo request headers back). Takes the body text already read by the caller (a `Response` body can only be consumed once). */
function describeHttpError(response: Response, bodyText: string): string {
  const parsedMessage = extractErrorMessage(bodyText);

  switch (response.status) {
    case 401:
      return "OpenRouter rejected the configured API key (401 Unauthorized) — the key may be invalid or revoked.";
    case 403:
      return "OpenRouter denied this request (403 Forbidden) — the configured API key may lack access to this model.";
    case 429:
      return "OpenRouter rate-limited this request (429 Too Many Requests) — please try again shortly.";
    default:
      if (response.status >= 500) {
        return `OpenRouter is temporarily unavailable (${response.status}) — please try again shortly.`;
      }
      return `OpenRouter request failed (${response.status})${parsedMessage ? `: ${parsedMessage}` : ""}`;
  }
}

/**
 * Throws `ProviderTemporaryError` (fallback-eligible) for
 * 429/413/5xx, a plain `Error` (never falls back — a config/application
 * problem) for everything else, e.g. 401/403. `describeHttpError` above
 * still produces the exact same user-facing message either way; the
 * caller additionally classifies WHICH kind of temporary failure this was.
 */
/** Mirrors `groq-provider.ts`'s own `parseRetryAfterSeconds` — see that file's doc comment. */
function parseRetryAfterSeconds(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function throwForFailedResponse(response: Response): Promise<never> {
  const bodyText = await safeErrorText(response);
  const message = describeHttpError(response, bodyText);
  const bodyReason = isContextOrRateLimitBody(bodyText);

  if (response.status === 413 || bodyReason === "context_limit") {
    throw new ProviderTemporaryError(message, "openrouter", "context_limit");
  }
  if (response.status === 429) {
    throw new ProviderTemporaryError(message, "openrouter", bodyReason === "quota_exceeded" ? "quota_exceeded" : "rate_limit", parseRetryAfterSeconds(response) ?? undefined);
  }
  // Same reasoning as groq-provider.ts: a 404 means
  // the configured model name isn't available on this account right now, a
  // condition a different provider/model can genuinely resolve.
  if (response.status === 404) {
    throw new ProviderTemporaryError(message, "openrouter", "model_unavailable");
  }
  if (response.status >= 500) {
    throw new ProviderTemporaryError(message, "openrouter", "temporary_error");
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
 * OpenRouter's own
 * current documentation states usage (including `prompt_tokens_details
 * .cached_tokens`) is "always included automatically in every response",
 * streaming or not, with no request parameter required (the older
 * `usage: { include: true }` flag is deprecated/now a no-op) — verified
 * before adding this, not assumed. Mirrors `groq-provider.ts`'s
 * `extractUsage` exactly (both are OpenAI-compatible shapes); a field this
 * app's response doesn't actually contain stays `null`, never a fabricated
 * `0`.
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

class OpenRouterProvider implements AIProvider {
  readonly id = "openrouter" as const;
  readonly meta = OPENROUTER_META;

  async getStatus(): Promise<ProviderConnectionStatus> {
    const key = apiKey();
    if (!key) return "not-configured";

    try {
      // Lightweight, low-cost probe — lists models rather than generating content,
      // matching gemini-provider.ts's getStatus() convention.
      const response = await fetchWithRetry(`${OPENROUTER_API_BASE}/models`, {
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
    // Fallback-eligible, not a dead end: a missing
    // OpenRouter key says nothing about a sibling provider's configuration.
    if (!key) throw new ProviderTemporaryError(MISSING_KEY_MESSAGE, "openrouter", "unavailable");
    const { text } = await chatWithOpenRouterApiKey(key, model, temperature, messages, signal, onUsage);
    return text;
  }

  async *streamChat({ model, temperature, messages, signal, onUsage }: ChatOptions): AsyncGenerator<string, void, unknown> {
    const key = apiKey();
    if (!key) throw new ProviderTemporaryError(MISSING_KEY_MESSAGE, "openrouter", "unavailable");
    yield* streamWithOpenRouterApiKey(key, model, temperature, messages, signal, onUsage);
  }
}

export const openrouterProvider = new OpenRouterProvider();

/**
 * AURA Multi-Key, Multi-Model & Capability-Aware
 * Provider Pool — everything below is NEW, purely additive,
 * mirroring `groq-provider.ts`'s own identical fix (see that file's doc
 * comment for the full rationale): `endpoint-registry.ts` previously routed
 * every OpenRouter endpoint through this file's singleton, whose `chat()`/
 * `streamChat()` always read `process.env.OPENROUTER_API_KEY` internally —
 * a second configured OpenRouter credential (`OPENROUTER_2_API_KEY`) was
 * therefore silently never actually used. These key-parameterized functions
 * are the fix.
 */
export async function chatWithOpenRouterApiKey(
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
      `${OPENROUTER_API_BASE}/chat/completions`,
      { method: "POST", headers: headers(key), body: JSON.stringify({ model, messages: toOpenRouterMessages(messages), temperature, stream: false }) },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "OpenRouter request failed.",
      "openrouter",
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
      error instanceof Error ? error.message : "OpenRouter response could not be read.",
      "openrouter",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
  const usage = extractUsage(data);
  if (usage) onUsage?.(usage);
  const text = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
  return { text: typeof text === "string" ? text : "", usage };
}

export async function* streamWithOpenRouterApiKey(
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
      `${OPENROUTER_API_BASE}/chat/completions`,
      { method: "POST", headers: headers(key), body: JSON.stringify({ model, messages: toOpenRouterMessages(messages), temperature, stream: true }) },
      signal,
    );
  } catch (error) {
    throw new ProviderTemporaryError(
      error instanceof Error ? error.message : "OpenRouter request failed.",
      "openrouter",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "unavailable",
    );
  }

  if (!response.ok) {
    await throwForFailedResponse(response);
  }
  if (!response.body) {
    throw new ProviderTemporaryError("OpenRouter returned an empty response body.", "openrouter", "temporary_error");
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
      error instanceof Error ? error.message : "OpenRouter stream was interrupted.",
      "openrouter",
      error instanceof DOMException && error.name === "AbortError" ? "timeout" : "temporary_error",
    );
  }
}
