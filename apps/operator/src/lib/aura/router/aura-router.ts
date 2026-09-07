import "server-only";

import { ProviderTemporaryError, type ProviderFailureReason, type ProviderUsage } from "../providers/provider";
import type { ProviderId } from "../types";
import {
  createAdapterForEndpoint,
  getEndpoint,
  isEndpointConfigured,
  isEndpointInCooldown,
  listAllEndpoints,
  listEndpointsForCapability,
  recordEndpointFailure,
  recordEndpointSuccess,
} from "./endpoint-registry";
import { findCatalogModel } from "./model-catalog";
import type {
  AuraAudioAttachment,
  AuraCanonicalRequest,
  AuraCapability,
  AuraEndpointConfig,
  AuraRouterAttempt,
  AuraRouterResult,
  AuraSpeechRouterResult,
  AuraTranscribeRouterResult,
} from "./types";
import { AuraRouterAllFailedError } from "./types";

/**
 * The centralized
 * routing function Part 7 asks for. This is the ONLY place fallback logic
 * lives for the new router ("do not allow the UI to implement
 * fallback logic"); callers (the Operator test API route today, a future
 * Farmer AURA route eventually — Part 1's own "this routing layer will
 * later be consumed by Farmer AURA") never see an intermediate failure
 * except through the returned diagnostics.
 *
 * Part 8's per-reason fallback policy — deliberately a LOOSER policy than
 * the legacy per-PROVIDER `chat-router.ts` uses (that file leaves 401/403
 * as non-fallback-eligible, correct for its own one-key-per-provider
 * design): here, an authentication/configuration failure on ONE ENDPOINT
 * (e.g. `gemini-1`'s specific key) says nothing about a DIFFERENT
 * endpoint's key (`gemini-2`, or an entirely different provider), so it is
 * fallback-eligible — advancing to the next endpoint is exactly what
 * should happen. The one reason that is NEVER fallback-eligible is
 * `invalid_request` (Part 8's own explicit example: "do not blindly retry
 * a request that is broken because of how WE built it" — a different
 * endpoint would fail the same way).
 */
function isFallbackEligible(reason: ProviderFailureReason): boolean {
  return reason !== "invalid_request";
}

/**
 * Part 8/9/10 — a conservative reserve for AURA's own reply, added on top
 * of `estimatedInputTokens` before comparing against an endpoint's verified
 * `contextWindowTokens` (`model-catalog.ts`). A real AURA reply in this
 * project's own live testing has run anywhere from a few dozen to several
 * hundred completion tokens; 1,500 comfortably covers a genuinely long
 * multi-paragraph answer without needing per-request output-length
 * prediction (which this project doesn't do, and Part 6 explicitly
 * discourages adding a second LLM call just to decide this).
 */
const RESERVED_OUTPUT_TOKENS = 1_500;

/**
 * Part 9/10 — "the provider router should receive enough information to
 * skip structurally incompatible endpoints... do NOT rely on trial-and-
 * error fallback to discover context incompatibility." `true` whenever
 * either side of the comparison is unknown (no estimate supplied by the
 * caller, or this specific model has no verified ceiling on record — e.g.
 * an STT/TTS model, where "input token budget" isn't a meaningful concept)
 * — the SAME safe-default-to-inclusion philosophy `context-selector.ts`
 * already uses for domain selection, applied here to provider eligibility:
 * an unknown always fails open (still eligible), never silently excluded.
 */
function isContextCompatible(endpoint: AuraEndpointConfig, estimatedInputTokens: number | undefined): boolean {
  if (estimatedInputTokens === undefined) return true;
  const catalogModel = findCatalogModel(endpoint.provider, endpoint.model);
  const ceiling = catalogModel?.contextWindowTokens;
  if (ceiling === undefined) return true;
  return ceiling >= estimatedInputTokens + RESERVED_OUTPUT_TOKENS;
}

/**
 * Applies `isContextCompatible` to a whole chain ONCE, before the fallback
 * loop ever starts ("must not bypass the existing provider
 * router. Do not create a second provider router" — this is a single
 * additional ELIGIBILITY predicate applied to the SAME chain the Operator's
 * own configured order already produced, exactly like the existing
 * `enabled`/capability checks the loop itself applies per-attempt; it never
 * reorders, adds, or duplicates anything). Manual-mode benchmarking
 * (`options.manualEndpointId`) deliberately bypasses this — see
 * `routeAURARequest`'s own doc comment on why manual mode already skips the
 * `enabled` check for the same "an Operator should be able to test one
 * specific endpoint deliberately" reason.
 */
function filterChainForContext(chain: AuraEndpointConfig[], estimatedInputTokens: number | undefined, requestId: string): AuraEndpointConfig[] {
  if (estimatedInputTokens === undefined) return chain;
  const eligible: AuraEndpointConfig[] = [];
  const excluded: string[] = [];
  for (const endpoint of chain) {
    if (isContextCompatible(endpoint, estimatedInputTokens)) {
      eligible.push(endpoint);
    } else {
      const ceiling = findCatalogModel(endpoint.provider, endpoint.model)?.contextWindowTokens;
      excluded.push(`${endpoint.displayName}(ceiling=${ceiling})`);
    }
  }
  if (excluded.length > 0) {
    console.info(
      `[AURA][context-router] requestId=${requestId} estimatedInputTokens=${estimatedInputTokens} skipped-context-incompatible=[${excluded.join(", ")}] eligible=${eligible.length}/${chain.length}`,
    );
  }
  return eligible;
}

/** Exported so callers (the Operator router-test route today) never invent their own request-id format. */
export function newRequestId(): string {
  return `aura-rt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The router-level timeout an earlier change's live testing found missing: a single
 * attempt (`gemini-1`, cold) was observed taking ~34–90 seconds because
 * each provider's OWN `fetchWithRetry` (Groq/OpenRouter/Gemini all share
 * this shape) independently retries up to 2 times with a 30s-per-attempt
 * timeout — up to ~90s for ONE endpoint before the router even gets a
 * chance to move on. This constant is the router's OWN upper bound,
 * layered ON TOP of (not replacing) that existing per-provider retry
 * logic — reusing the exact same `AbortSignal` plumbing every adapter's
 * `generate`/`stream` already accepts and forwards into its own
 * `fetchWithRetry` call, so aborting here genuinely cancels the in-flight
 * HTTP request (Part 13 — no leaked request) rather than merely giving up
 * on waiting for it.
 *
 * Two tiers, per Part 12's own instruction ("manual tests may reasonably
 * allow longer time; automatic routing should have a stricter bound"):
 * `automatic`: 16 seconds (raised from an earlier 12s under the rule
 *  "do not blindly increase the timeout... if a change is genuinely
 *  necessary, justify it based on real measurements"). The 12s was
 *  measured against SHORT, simple prompts (Groq ~1–2s, Gemini ~2–11s
 *  warm). Live testing found a real, reproducible case that number no
 *  longer covers: a genuine multi-turn field-diagnosis conversation
 *  (image analysis + several follow-ups, each carrying real farm
 *  context — Sensors/Weather/Plot Recommendations/Crop Findings for the
 *  identified plot) produces an ~10–11K-token prompt, and individual
 *  SUCCESSFUL attempts against that size were repeatedly observed
 *  taking 13–30s across this session's own real Gemini/OpenRouter
 *  calls — meaning the OLD 12s bound was cutting off attempts that
 *  would have succeeded, and in one reproduced case caused EVERY
 *  endpoint in the TEXT chain (7 of 7) to be killed by the router's own
 *  timeout before any could finish, even though a fresh, shorter
 *  conversation on the identical topic succeeded normally moments
 *  later. 16s keeps a firm, real bound (a full worst-case automatic
 *  chain is still bounded, not the ~90s a single stuck legacy endpoint
 *  could once cost) while comfortably covering the real latency this
 *  phase's own field-context feature actually produces. Kept as ONE
 *  shared value for both capabilities rather than a TEXT-specific one —
 *  this session's own measured IMAGE-capability latencies (also
 *  commonly 7–33s) show the same range, so a capability-specific split
 *  isn't supported by the evidence gathered.
 *  - `manual`: 30 seconds — matches each provider's own existing
 *  single-attempt `REQUEST_TIMEOUT_MS`, giving an Operator benchmarking
 *  one specific endpoint its full natural patience, never artificially
 *  cut short.
 * Centralized here (not duplicated in each route/adapter) per Part 12's
 * own "configurable in one place" requirement.
 */
export const ROUTER_ATTEMPT_TIMEOUT_MS = {
  automatic: 16_000,
  manual: 30_000,
} as const;

/**
 * Runs `run` with a fresh `AbortController`, aborting it if `timeoutMs`
 * elapses first — the one place this file creates a timeout, reused by
 * both `routeAURARequest` and `streamAURARequest`.
 *
 * AURA Reliability & Field Intelligence
 * Integration — also aborts immediately if the CALLER's own
 * `externalSignal` fires (the incoming HTTP request's own `signal`,
 * threaded from `route.ts` — see that file's own doc comment). Before
 * this, a farmer navigating away or closing the tab mid-response left
 * whichever provider attempt was in flight running to completion
 * regardless — a real dangling request (wasted provider time/cost, no
 * actual reason to keep computing an answer nobody will ever see). This
 * is the SAME `AbortSignal` plumbing every adapter's `generate`/`stream`
 * already accepts and forwards into its own `fetchWithRetry` call, so
 * external cancellation genuinely cancels the in-flight HTTP request, not
 * merely gives up on waiting for it — identical guarantee to the
 * existing per-attempt timeout, just triggered by a different source.
 */
async function withRouterTimeout<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number, externalSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Part 7's `routeAURARequest`. `manualEndpointId`, when set (Operator
 * manual-mode test — Part 17), skips the configured automatic chain
 * entirely and attempts ONLY that one endpoint, with no fallback — a
 * deliberate benchmarking tool, never mixed with automatic routing.
 */
export async function routeAURARequest(
  request: AuraCanonicalRequest,
  options: { manualEndpointId?: string; signal?: AbortSignal } = {},
): Promise<AuraRouterResult> {
  const attemptTimeoutMs = options.manualEndpointId ? ROUTER_ATTEMPT_TIMEOUT_MS.manual : ROUTER_ATTEMPT_TIMEOUT_MS.automatic;
  const attempts: AuraRouterAttempt[] = [];

  // Automatic mode
  // reads THIS request's own capability-specific chain from
  // `AuraRouteCapabilityPriority` (Postgres), fresh on every call, so an
  // Operator's drag-and-drop reorder for "text" (say) takes effect on the
  // very next text request without touching "image"'s or "voice"'s own
  // independent order (Part "Capability independence"). Manual mode looks
  // the named endpoint up directly, independent of any capability chain
  // membership — an Operator benchmarking one endpoint shouldn't first
  // have to add it to a chain ("Manual mode must NOT modify the
  // automatic order" — and must not be gated by chain membership either).
  const chain = options.manualEndpointId
    ? await (async () => {
        const endpoint = await getEndpoint(options.manualEndpointId!);
        if (!endpoint) {
          // A manual-mode request naming an endpoint id that doesn't exist is
          // a caller mistake (Operator UI bug, stale id, typo'd API call) —
          // surface it as its own clear, honest failure immediately, rather
          // than falling through to the generic "no endpoint configured for
          // this capability" message below.
          throw new AuraRouterAllFailedError(`"${options.manualEndpointId}" is not a configured AURA endpoint.`, []);
        }
        return [endpoint];
      })()
    : filterChainForContext(await listEndpointsForCapability(request.capability), request.estimatedInputTokens, request.requestId);

  for (const [index, endpoint] of chain.entries()) {
    const priority = index + 1;
    // Part 7 Step 3 / Part 22 "Disabled endpoints are skipped" — checked
    // BEFORE ever attempting a request, so a disabled/unconfigured/
    // capability-mismatched endpoint costs nothing (Part 31: the normal
    // path never pays for a health check it doesn't need). A MANUAL
    // benchmark request deliberately bypasses the enabled check — an
    // Operator should be able to test a model before switching it on for
    // automatic routing (manual mode never reorders/modifies automatic
    // routing either way, per the "Manual Benchmark Mode"
    // rule).
    if (!options.manualEndpointId && !endpoint.enabled) continue;
    // Defense in depth (Part 7/29 #16-18) — `listEndpointsForCapability`
    // already filters to participating endpoints, but a manual-mode
    // endpoint (looked up directly, bypassing the chain entirely) or a
    // stale/inconsistent row must still never be allowed to serve a
    // capability it doesn't structurally support.
    if (!endpoint.capabilities.includes(request.capability)) continue;
    // Same exception as the `enabled`
    // check above: automatic routing must never re-hammer an endpoint
    // that's still inside its own real cooldown window, but a manual
    // Operator-initiated test is a deliberate, one-off benchmark and should
    // still be allowed to probe it directly.
    if (!options.manualEndpointId && isEndpointInCooldown(endpoint.id)) continue;
    if (!isEndpointConfigured(endpoint)) {
      attempts.push({
        endpointId: endpoint.id,
        provider: endpoint.provider,
        model: endpoint.model,
        priority,
        success: false,
        latencyMs: 0,
        failureReason: "configuration_error",
        errorMessage: `${endpoint.displayName} isn't configured.`,
        usage: null,
      });
      recordEndpointFailure(endpoint.id, "configuration_error");
      continue;
    }

    const adapter = createAdapterForEndpoint(endpoint);
    const startedAt = Date.now();
    try {
      const { text, usage } = await withRouterTimeout((signal) => adapter.generate(request, signal), attemptTimeoutMs, options.signal);
      const latencyMs = Date.now() - startedAt;
      recordEndpointSuccess(endpoint.id, latencyMs);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: true, latencyMs, failureReason: null, errorMessage: null, usage });

      return {
        text,
        capability: request.capability,
        endpointId: endpoint.id,
        provider: endpoint.provider,
        model: endpoint.model,
        latencyMs,
        usage,
        fallbackCount: attempts.filter((attempt) => !attempt.success).length,
        attempts,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason: ProviderFailureReason = error instanceof ProviderTemporaryError ? error.reason : "invalid_request";
      const message = error instanceof Error ? error.message : "Unknown router adapter failure.";
      recordEndpointFailure(endpoint.id, reason, error instanceof ProviderTemporaryError ? error.retryAfterSeconds : undefined);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs, failureReason: reason, errorMessage: message, usage: null });

      if (!isFallbackEligible(reason)) break; // Part 8 — never blindly retry a request broken by our own construction.
      // Otherwise fall through and try the next endpoint in the chain.
    }
  }

  // Part 7 Step 8 — every eligible endpoint failed (or the chain was empty
  // for this capability, e.g. voice today): a structured, honest failure,
  // never a fabricated answer.
  throw new AuraRouterAllFailedError(
    attempts.length > 0 ? "Every configured AURA endpoint for this request failed." : `No AURA endpoint is configured for capability "${request.capability}" yet.`,
    attempts,
  );
}

export interface StreamAuraResult {
  capability: AuraCapability;
  endpointId: string;
  provider: ProviderId;
  model: string;
  usage: ProviderUsage | null;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
}

/**
 * The streaming twin of `routeAURARequest`, built for the app's actual DEFAULT
 * path (`streamingEnabled: true`). Same chain-resolution and per-attempt
 * timeout as the non-streaming function above; the one genuinely different
 * rule is Part 8/9's streaming-specific safety requirement, mirrored
 * exactly from the legacy `chat-router.ts`'s own already-proven
 * `streamChatWithFallback`: fallback is only ever attempted BEFORE any
 * real content has reached the caller for THIS request. The moment a
 * single delta has been forwarded via `handlers.onDelta`, a later failure
 * on that same attempt is thrown as-is, never triggering a fallback — that
 * would glue part of one provider's answer to the start of a different
 * provider's answer, exactly the "half a Gemini response + a second
 * unrelated Groq response" Part 8 explicitly forbids. This is a hard
 * safety rule, not a performance choice.
 */
export async function streamAURARequest(
  request: AuraCanonicalRequest,
  handlers: { onDelta: (delta: string) => void },
  options: { manualEndpointId?: string; signal?: AbortSignal } = {},
): Promise<StreamAuraResult> {
  const attemptTimeoutMs = options.manualEndpointId ? ROUTER_ATTEMPT_TIMEOUT_MS.manual : ROUTER_ATTEMPT_TIMEOUT_MS.automatic;
  const attempts: AuraRouterAttempt[] = [];

  // See `routeAURARequest`'s own doc comment for
  // why automatic and manual mode resolve their chain so differently here.
  const chain = options.manualEndpointId
    ? await (async () => {
        const endpoint = await getEndpoint(options.manualEndpointId!);
        if (!endpoint) {
          throw new AuraRouterAllFailedError(`"${options.manualEndpointId}" is not a configured AURA endpoint.`, []);
        }
        return [endpoint];
      })()
    : filterChainForContext(await listEndpointsForCapability(request.capability), request.estimatedInputTokens, request.requestId);

  for (const [index, endpoint] of chain.entries()) {
    const priority = index + 1;
    if (!options.manualEndpointId && !endpoint.enabled) continue;
    if (!endpoint.capabilities.includes(request.capability)) continue;
    if (!options.manualEndpointId && isEndpointInCooldown(endpoint.id)) continue;
    if (!isEndpointConfigured(endpoint)) {
      attempts.push({
        endpointId: endpoint.id,
        provider: endpoint.provider,
        model: endpoint.model,
        priority,
        success: false,
        latencyMs: 0,
        failureReason: "configuration_error",
        errorMessage: `${endpoint.displayName} isn't configured.`,
        usage: null,
      });
      recordEndpointFailure(endpoint.id, "configuration_error");
      continue;
    }

    const adapter = createAdapterForEndpoint(endpoint);
    const startedAt = Date.now();
    let yieldedAny = false;
    try {
      const { usage } = await withRouterTimeout(
        (signal) =>
          adapter.stream(
            request,
            (delta) => {
              yieldedAny = true;
              handlers.onDelta(delta);
            },
            signal,
          ),
        attemptTimeoutMs,
        options.signal,
      );
      const latencyMs = Date.now() - startedAt;
      recordEndpointSuccess(endpoint.id, latencyMs);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: true, latencyMs, failureReason: null, errorMessage: null, usage });

      return {
        capability: request.capability,
        endpointId: endpoint.id,
        provider: endpoint.provider,
        model: endpoint.model,
        usage,
        fallbackCount: attempts.filter((attempt) => !attempt.success).length,
        attempts,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason: ProviderFailureReason = error instanceof ProviderTemporaryError ? error.reason : "invalid_request";
      const message = error instanceof Error ? error.message : "Unknown router adapter failure.";
      recordEndpointFailure(endpoint.id, reason, error instanceof ProviderTemporaryError ? error.retryAfterSeconds : undefined);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs, failureReason: reason, errorMessage: message, usage: null });

      // Part 8/9 — see this function's own doc comment: once real content
      // already reached the caller, never fall back, no matter how
      // fallback-eligible the reason would otherwise be.
      if (yieldedAny) throw error;
      if (!isFallbackEligible(reason)) break;
      // Otherwise fall through and try the next endpoint in the chain.
    }
  }

  throw new AuraRouterAllFailedError(
    attempts.length > 0 ? "Every configured AURA endpoint for this request failed." : `No AURA endpoint is configured for capability "${request.capability}" yet.`,
    attempts,
  );
}

/** Exposed for the Operator diagnostics/routing UI — never returns a key, only the durable config shape, in the Operator's own current priority order. */
export async function listConfiguredEndpoints(): Promise<AuraEndpointConfig[]> {
  return listAllEndpoints();
}

/**
 * AURA Multi-Key, Multi-Model & Capability-Aware
 * Provider Pool — the SPEECH_TO_TEXT twin of
 * `routeAURARequest`: same chain resolution (`listEndpointsForCapability`/
 * manual-endpoint lookup), same per-attempt timeout/cooldown/health-
 * recording, same honest all-failed error — just calling `adapter.
 * transcribe()` instead of `adapter.generate()`, since a transcription
 * request/response has nothing in common with a chat completion (see
 * `AuraAudioAttachment`'s own doc comment, `types.ts`). Deliberately a
 * SEPARATE function rather than a generic `walk()` helper shared with
 * `routeAURARequest` — the existing text/image fallback loop is the most
 * heavily live-tested code in this project; a
 * generic rewrite risks a regression there for a benefit (avoiding ~40
 * lines of structurally-similar-but-not-identical loop code) this change's
 * own Part 36 ("do not break existing AURA") weighs against. Every
 * genuinely SHARED piece (the adapter itself, `withRouterTimeout`, health/
 * cooldown recording, the endpoint-registry chain functions) is already
 * factored out and reused here unchanged.
 */
export async function transcribeAudio(
  audio: AuraAudioAttachment,
  // `language`, forwarded
  // to whichever adapter's own `transcribe` actually implements it (today,
  // only Groq's — see that function's own doc comment for the live
  // evidence this addresses); an adapter that doesn't use it simply ignores
  // the extra argument.
  options: { manualEndpointId?: string; signal?: AbortSignal; language?: string } = {},
): Promise<AuraTranscribeRouterResult> {
  const attemptTimeoutMs = options.manualEndpointId ? ROUTER_ATTEMPT_TIMEOUT_MS.manual : ROUTER_ATTEMPT_TIMEOUT_MS.automatic;
  const attempts: AuraRouterAttempt[] = [];
  const capability = "speech_to_text" as const;

  const chain = options.manualEndpointId
    ? await (async () => {
        const endpoint = await getEndpoint(options.manualEndpointId!);
        if (!endpoint) throw new AuraRouterAllFailedError(`"${options.manualEndpointId}" is not a configured AURA endpoint.`, []);
        return [endpoint];
      })()
    : await listEndpointsForCapability(capability);

  for (const [index, endpoint] of chain.entries()) {
    const priority = index + 1;
    if (!options.manualEndpointId && !endpoint.enabled) continue;
    if (!endpoint.capabilities.includes(capability)) continue;
    if (!options.manualEndpointId && isEndpointInCooldown(endpoint.id)) continue;
    if (!isEndpointConfigured(endpoint)) {
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs: 0, failureReason: "configuration_error", errorMessage: `${endpoint.displayName} isn't configured.`, usage: null });
      recordEndpointFailure(endpoint.id, "configuration_error");
      continue;
    }

    const adapter = createAdapterForEndpoint(endpoint);
    if (!adapter.transcribe) {
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs: 0, failureReason: "unsupported_capability", errorMessage: `${endpoint.displayName} does not implement speech-to-text.`, usage: null });
      recordEndpointFailure(endpoint.id, "unsupported_capability");
      continue;
    }

    const startedAt = Date.now();
    try {
      const { text, usage, detectedLanguage } = await withRouterTimeout((signal) => adapter.transcribe!(audio, signal, options.language), attemptTimeoutMs, options.signal);
      const latencyMs = Date.now() - startedAt;
      recordEndpointSuccess(endpoint.id, latencyMs);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: true, latencyMs, failureReason: null, errorMessage: null, usage });
      return {
        text,
        endpointId: endpoint.id,
        provider: endpoint.provider,
        model: endpoint.model,
        latencyMs,
        usage,
        fallbackCount: attempts.filter((attempt) => !attempt.success).length,
        attempts,
        detectedLanguage,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason: ProviderFailureReason = error instanceof ProviderTemporaryError ? error.reason : "invalid_request";
      const message = error instanceof Error ? error.message : "Unknown router adapter failure.";
      recordEndpointFailure(endpoint.id, reason, error instanceof ProviderTemporaryError ? error.retryAfterSeconds : undefined);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs, failureReason: reason, errorMessage: message, usage: null });
      if (!isFallbackEligible(reason)) break;
    }
  }

  throw new AuraRouterAllFailedError(
    attempts.length > 0 ? "Every configured AURA speech-to-text endpoint failed." : `No AURA endpoint is configured for capability "${capability}" yet.`,
    attempts,
  );
}

/**
 * The TEXT_TO_SPEECH twin of `transcribeAudio` above — same structure, same
 * reasoning for staying a separate function (see that function's own doc
 * comment).
 */
export async function synthesizeSpeechRequest(
  text: string,
  options: { manualEndpointId?: string; signal?: AbortSignal } = {},
): Promise<AuraSpeechRouterResult> {
  const attemptTimeoutMs = options.manualEndpointId ? ROUTER_ATTEMPT_TIMEOUT_MS.manual : ROUTER_ATTEMPT_TIMEOUT_MS.automatic;
  const attempts: AuraRouterAttempt[] = [];
  const capability = "text_to_speech" as const;

  const chain = options.manualEndpointId
    ? await (async () => {
        const endpoint = await getEndpoint(options.manualEndpointId!);
        if (!endpoint) throw new AuraRouterAllFailedError(`"${options.manualEndpointId}" is not a configured AURA endpoint.`, []);
        return [endpoint];
      })()
    : await listEndpointsForCapability(capability);

  for (const [index, endpoint] of chain.entries()) {
    const priority = index + 1;
    if (!options.manualEndpointId && !endpoint.enabled) continue;
    if (!endpoint.capabilities.includes(capability)) continue;
    if (!options.manualEndpointId && isEndpointInCooldown(endpoint.id)) continue;
    if (!isEndpointConfigured(endpoint)) {
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs: 0, failureReason: "configuration_error", errorMessage: `${endpoint.displayName} isn't configured.`, usage: null });
      recordEndpointFailure(endpoint.id, "configuration_error");
      continue;
    }

    const adapter = createAdapterForEndpoint(endpoint);
    if (!adapter.synthesizeSpeech) {
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs: 0, failureReason: "unsupported_capability", errorMessage: `${endpoint.displayName} does not implement text-to-speech.`, usage: null });
      recordEndpointFailure(endpoint.id, "unsupported_capability");
      continue;
    }

    const startedAt = Date.now();
    try {
      const { audioBase64, mimeType, usage, wrapMs } = await withRouterTimeout((signal) => adapter.synthesizeSpeech!(text, signal), attemptTimeoutMs, options.signal);
      const latencyMs = Date.now() - startedAt;
      recordEndpointSuccess(endpoint.id, latencyMs);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: true, latencyMs, failureReason: null, errorMessage: null, usage });
      return { audioBase64, mimeType, endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, latencyMs, usage, wrapMs, fallbackCount: attempts.filter((attempt) => !attempt.success).length, attempts };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const reason: ProviderFailureReason = error instanceof ProviderTemporaryError ? error.reason : "invalid_request";
      const message = error instanceof Error ? error.message : "Unknown router adapter failure.";
      recordEndpointFailure(endpoint.id, reason, error instanceof ProviderTemporaryError ? error.retryAfterSeconds : undefined);
      attempts.push({ endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, priority, success: false, latencyMs, failureReason: reason, errorMessage: message, usage: null });
      if (!isFallbackEligible(reason)) break;
    }
  }

  throw new AuraRouterAllFailedError(
    attempts.length > 0 ? "Every configured AURA text-to-speech endpoint failed." : `No AURA endpoint is configured for capability "${capability}" yet.`,
    attempts,
  );
}
