import "server-only";

import type { AuraMessage, ProviderId } from "../types";
import { fallbackGroqModel } from "./groq-provider";
import { ProviderTemporaryError, type ProviderFailureReason, type ProviderUsage } from "./provider";
import { getProvider } from "./provider-registry";

/**
 * A diagnostic hook carrying whichever provider/model actually served the
 * request alongside its own reported usage, so a caller (the API route)
 * can log real before/after token figures without this router knowing
 * anything about logging itself.
 */
export type UsageHandler = (info: { providerId: ProviderId; model: string; usage: ProviderUsage }) => void;

/**
 * The generalized, extensible provider fallback
 * router. Before this, `app/api/aura/chat/route.ts` had exactly ONE
 * hardcoded fallback edge (OpenRouter → Groq, only when OpenRouter itself
 * was the requested provider). This replaces that with a real N-provider
 * chain usable for ANY requested provider, per Part 20's "the system should
 * be extensible" — adding a future real provider means adding it to
 * `PROVIDER_PRIORITY` below and its own `*-provider.ts`, nothing here.
 *
 * `PROVIDER_PRIORITY` IS the "default priority: 1. Groq 2. OpenRouter
 * 3. other" Part 20 asks for — reordering this array is the entire policy
 * change. The requested provider is always tried FIRST regardless of this
 * order (a Farmer/Operator's own explicit selection is honored before any
 * priority default); this list only decides what's tried NEXT once that
 * fails.
 *
 * Part 18 (the most important rule of this change): every attempt below
 * shares the exact same `messages` array (the canonical `AuraContext`
 * already folded in by `prompt-builder.ts` upstream, unchanged, in
 * `route.ts`) — the loop only ever swaps `providerId`/`model`, never the
 * context. There is no "reduced context" code path anywhere here.
 */
export const PROVIDER_PRIORITY: readonly ProviderId[] = ["groq", "openrouter", "gemini", "openai", "claude", "ollama"];

export interface FallbackChatResult {
  content: string;
  providerUsed: ProviderId;
  fallbackFrom: ProviderId | null;
  fallbackReason: ProviderFailureReason | null;
}

/** The model to use for a provider ENTERED VIA FALLBACK (not the client's own explicit selection) — each provider's own first/default model, except Groq, which additionally honors `GROQ_MODEL` (see `groq-provider.ts`) so a fallback target can be repointed without a code change. */
function fallbackModelFor(providerId: ProviderId): string {
  if (providerId === "groq") return fallbackGroqModel();
  return getProvider(providerId).meta.models[0] ?? "";
}

/** `requested` first (if implemented), then every other IMPLEMENTED provider in `PROVIDER_PRIORITY` order — a provider with no real implementation (a stub) is simply skipped, never dead-ends the chain by itself. */
function buildChain(requested: ProviderId): ProviderId[] {
  const rest = PROVIDER_PRIORITY.filter((id) => id !== requested && getProvider(id).meta.implemented);
  return getProvider(requested).meta.implemented ? [requested, ...rest] : rest;
}

/** Non-streaming path: walks the chain, returning the first success. Only a `ProviderTemporaryError` advances to the next provider — any other error (bad credentials, malformed request) surfaces immediately. Throws only when EVERY eligible provider failed ("return a truthful error", never a fabricated response). */
export async function chatWithFallback(
  requestedProviderId: ProviderId,
  requestedModel: string,
  temperature: number,
  messages: AuraMessage[],
  onUsage?: UsageHandler,
): Promise<FallbackChatResult> {
  const chain = buildChain(requestedProviderId);
  let fallbackFrom: ProviderId | null = null;
  let fallbackReason: ProviderFailureReason | null = null;
  let lastError: unknown = null;

  for (const providerId of chain) {
    const model = providerId === requestedProviderId ? requestedModel : fallbackModelFor(providerId);
    try {
      const content = await getProvider(providerId).chat({
        model,
        temperature,
        messages,
        onUsage: onUsage ? (usage) => onUsage({ providerId, model, usage }) : undefined,
      });
      return { content, providerUsed: providerId, fallbackFrom, fallbackReason };
    } catch (error) {
      lastError = error;
      if (!(error instanceof ProviderTemporaryError)) throw error;
      // Every hop's own failure reason, not just the final one `lastError` ends up
      // holding (an earlier gap the diagnostics work surfaced:
      // debugging "all providers failed" previously meant seeing only
      // whichever provider happened to be tried LAST).
      console.info(`[AURA] provider attempt failed: ${providerId} (${error.reason}) — ${error.message}`);
      // Part 22 — record the ORIGINAL failure's reason/source, not the last
      // one tried, so "why did we end up on provider 3?" answers honestly.
      fallbackFrom ??= error.providerId;
      fallbackReason ??= error.reason;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No configured AI provider could handle this request right now.");
}

export interface StreamFallbackHandlers {
  onDelta: (delta: string) => void;
  /** Called once, only if a fallback actually happened, before the first delta from the fallback provider — lets the caller record diagnostics (Part 22) without leaking them into the chat text itself (Part 23: the Farmer never sees provider mechanics). */
  onFallback?: (info: { fallbackFrom: ProviderId; fallbackReason: ProviderFailureReason; providerUsed: ProviderId }) => void;
}

/**
 * Streaming path — mirrors `chatWithFallback` but only ever
 * falls back to the NEXT provider if the CURRENT one fails before yielding
 * any content (the same rule established for the single
 * OpenRouter→Groq edge: switching provider mid-stream, after real text
 * already reached the client, would read as a garbled duplicate answer).
 */
export async function streamChatWithFallback(
  requestedProviderId: ProviderId,
  requestedModel: string,
  temperature: number,
  messages: AuraMessage[],
  handlers: StreamFallbackHandlers,
  onUsage?: UsageHandler,
): Promise<void> {
  const chain = buildChain(requestedProviderId);
  let fallbackFrom: ProviderId | null = null;
  let fallbackReason: ProviderFailureReason | null = null;
  let lastError: unknown = null;

  for (const providerId of chain) {
    const model = providerId === requestedProviderId ? requestedModel : fallbackModelFor(providerId);
    let yieldedAny = false;
    try {
      for await (const delta of getProvider(providerId).streamChat({
        model,
        temperature,
        messages,
        onUsage: onUsage ? (usage) => onUsage({ providerId, model, usage }) : undefined,
      })) {
        if (!yieldedAny && fallbackFrom && fallbackReason) {
          handlers.onFallback?.({ fallbackFrom, fallbackReason, providerUsed: providerId });
        }
        yieldedAny = true;
        handlers.onDelta(delta);
      }
      return;
    } catch (error) {
      lastError = error;
      if (yieldedAny || !(error instanceof ProviderTemporaryError)) throw error;
      // See the identical diagnostic in `chatWithFallback` above.
      console.info(`[AURA] provider attempt failed: ${providerId} (${error.reason}) — ${error.message}`);
      fallbackFrom ??= error.providerId;
      fallbackReason ??= error.reason;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("No configured AI provider could handle this request right now.");
}
