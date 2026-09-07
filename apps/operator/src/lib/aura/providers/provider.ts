import type { AuraMessage, ProviderConnectionStatus, ProviderId, ProviderMeta } from "../types";

/**
 * The provider abstraction every AI backend implements. AURA Core (the
 * chat/API route layer) only ever talks to this interface — no
 * provider-specific request shaping, error handling, or response parsing is
 * allowed to leak outside a `*-provider.ts` file.
 *
 *  AURA Core -> AIProvider interface -> GeminiProvider (implemented)
 *  -> OpenAIProvider (stub)
 *  -> ClaudeProvider (stub)
 *  -> OllamaProvider (stub)
 */
export interface AIProvider {
  readonly id: ProviderId;
  readonly meta: ProviderMeta;

  /** Whether this provider is configured and reachable right now (e.g. an API key is present). Never leaks the key/secret itself. */
  getStatus(): Promise<ProviderConnectionStatus>;

  /** Non-streaming chat — returns the full reply in one shot. */
  chat(options: ChatOptions): Promise<string>;

  /** Streaming chat — yields text deltas as they arrive. */
  streamChat(options: ChatOptions): AsyncGenerator<string, void, unknown>;
}

export interface ChatOptions {
  model: string;
  temperature: number;
  messages: AuraMessage[];
  /** Aborts the in-flight request (used to implement timeouts uniformly across providers). */
  signal?: AbortSignal;
  /**
   * Optional diagnostic
   * hook, called at most once per request, with whatever token usage the
   * provider's own response actually reported (never fabricated when a
   * field is missing — see `ProviderUsage`'s own doc comment). Never
   * receives a credential, a message body, or any other sensitive value —
   * token counts only. Purely additive: a provider/caller that doesn't pass
   * this behaves exactly as before.
   */
  onUsage?: (usage: ProviderUsage) => void;
}

/**
 * The token-usage
 * shape both Groq and OpenRouter report (both are OpenAI-compatible;
 * verified against each provider's own current documentation before this
 * was added —
 * Analysis" sections). `cachedTokens` is `prompt_tokens_details
 * .cached_tokens` from the provider's response when present — `null`, never
 * `0`, when the response didn't include that field at all, so a caller can
 * tell "reported zero cache hits" apart from "this response didn't report
 * cache data."
 */
export interface ProviderUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cachedTokens: number | null;
}

export class ProviderNotImplementedError extends Error {
  constructor(providerId: ProviderId) {
    super(`The ${providerId} provider is not implemented yet — coming soon.`);
    this.name = "ProviderNotImplementedError";
  }
}

/**
 * Diagnostic classification of WHY a provider failed,
 * carried alongside `ProviderTemporaryError` so the router (`chat-
 * router.ts`) can record it and the final "everything failed" message can
 * be honest about the actual cause. Never a secret/credential — just a
 * category.
 */
export type ProviderFailureReason =
  | "rate_limit"
  | "quota_exceeded"
  | "context_limit"
  | "timeout"
  | "temporary_error"
  | "unavailable"
  | "model_unavailable"
  /**
   * The four
   * additional categories that phase's own failure taxonomy requires
   * (AUTHENTICATION_ERROR / CONFIGURATION_ERROR / UNSUPPORTED_CAPABILITY /
   * INVALID_REQUEST), added here rather than as a second, competing enum so
   * every consumer (`chat-router.ts`, the new `router/` package, diagnostics)
   * shares one vocabulary. The pre-existing seven values above are
   * unchanged and still mean exactly what they did before this change —
   * `unavailable` already covers a plain network failure, which is why
   * there's no separate "network_error" here.
   */
  | "authentication_error"
  | "configuration_error"
  | "unsupported_capability"
  | "invalid_request";

/**
 * Thrown by a provider (instead of a plain `Error`) specifically
 * for failures that are genuinely worth retrying against a DIFFERENT
 * provider: HTTP 429, a 5xx, a context/length limit (the real Groq
 * TPM/context ceiling), a missing API key
 * ("provider unavailable": a DIFFERENT provider's key
 * being configured is exactly what makes this recoverable, unlike a
 * single-provider design where a missing key was a dead end), or a
 * network/timeout failure. Every other failure (401/403/malformed
 * request/etc — genuine credential/config problems no other provider can
 * fix either) stays a plain `Error`.
 * `lib/aura/providers/chat-router.ts` is the one place that checks for this
 * type to decide whether to advance to the next provider in the fallback
 * chain.
 */
export class ProviderTemporaryError extends Error {
  constructor(
    message: string,
    public readonly providerId: ProviderId,
    public readonly reason: ProviderFailureReason = "temporary_error",
    /**
     * AURA Multi-Key, Multi-Model & Capability-Aware
 * Provider Pool — the provider's own `Retry-After` response
     * header (seconds), when a rate-limit/quota failure actually included
     * one. `undefined` when not applicable/not present — `endpoint-
     * registry.ts`'s `recordEndpointFailure` falls back to a documented,
     * conservative DEFAULT cooldown only in that case, never fabricating a
     * provider-supplied-looking number.
     */
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ProviderTemporaryError";
  }
}
