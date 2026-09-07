import type { AuraMessage, ProviderId } from "../types";
import type { ConversationLanguage } from "../voice/language-detection";
import type { ProviderFailureReason, ProviderUsage } from "../providers/provider";

/**
 * The types for the
 * NEW, provider-agnostic routing layer described in that phase's own
 * architecture diagram: Context Layer -> Canonical Request ->
 * AURA Router -> { Gemini, Groq, OpenRouter,... } -> Final AURA result.
 *
 * This is deliberately layered ON TOP of the existing provider system
 * (`providers/provider.ts`'s `AIProvider`/`ProviderUsage`/
 * `ProviderTemporaryError`, `providers/provider-registry.ts`'s
 * `getProvider`) rather than replacing it — an ENDPOINT here (e.g.
 * "gemini-1", "gemini-2") is a specific, independently-configured
 * (model + API key) instance of a PROVIDER (gemini/groq/openrouter), which
 * the older one-singleton-per-provider design has no way to express (Part
 * 4's "multiple Gemini endpoints" requirement). Nothing here duplicates
 * `AuraContext`/`AuraMessage`/prompt construction — the canonical request
 * below wraps the SAME `AuraMessage[]` `buildMessagesForProvider` already
 * produces ("do not blindly create new types if equivalent types
 * already exist").
 */

/**
 * AURA Multi-Key, Multi-Model & Capability-Aware
 * The original generic `"voice"` bucket is
 * replaced with the two precise, independently-routable operations Voice
 * AURA actually needs: `speech_to_text` (audio in, transcript out) and
 * `text_to_speech` (text in, audio out). Part 9's own explicit rule —
 * "provider supports voice does NOT mean every model supports voice; the
 * router must understand provider + model + API operation + capability" —
 * is exactly why one generic `"voice"` value was never precise enough: a
 * Groq Whisper model and a Gemini TTS model are both "voice-related" but
 * satisfy completely different requests. No endpoint anywhere in this
 * project ever declared `"voice"` (grep-verified before this rename — the
 * old value was reachable code with zero real participants), so this is a
 * non-breaking rename, not a live migration. `structured_output` and
 * `audio_input` from Part 8's full suggested list are deliberately NOT
 * added as routable capabilities yet — no verified, currently-usable model
 * in this project's catalog needs them, and Part 38 forbids registering a
 * capability without a real, checked reason (see `model-catalog.ts`'s own
 * STT/TTS entries for the live verification evidence).
 */
export type AuraCapability = "text" | "image" | "speech_to_text" | "text_to_speech";

/**
 * Part 20's exact required vocabulary. Not merely a UI flag — see
 * `endpoint-registry.ts`'s `getEndpointRuntimeState` for how this is
 * derived from the endpoint's own configuration and its most recent real
 * result (never a background poll — Part 20/31: "avoid aggressive
 * background polling").
 */
export type AuraEndpointHealthStatus = "healthy" | "degraded" | "rate_limited" | "unavailable" | "misconfigured" | "disabled" | "unknown";

/**
 * One configured, named provider instance ("Provider Endpoint").
 * Data, not branching logic — adding a real new endpoint means adding one
 * `AuraRouteEndpoint` row (a durable Postgres row, added either by
 * the Operator's "Add Model" UI or the one-time default seed in
 * `endpoint-registry.ts`), never a new `if` anywhere else in this package
 * ("generic routing architecture, do not hardcode Gemini ->
 * Groq -> OpenRouter").
 */
export interface AuraEndpointConfig {
  id: string;
  provider: ProviderId;
  model: string;
  displayName: string;
  enabled: boolean;
  capabilities: AuraCapability[];
  /**
   * The NAME of the environment variable this endpoint's API key lives in
   * — never the value. `endpoint-registry.ts`'s `isEndpointConfigured`
   * checks `process.env[apiKeyEnvVar]` server-side only; nothing in this
   * package, its API routes, or the Operator UI ever reads or transmits
   * the actual key.
   */
  apiKeyEnvVar: string;
}

/** One attempt's outcome — the per-hop diagnostic record Part 18/19 wants surfaced to the Operator test panel. `priority` is this attempt's 1-based position in the CAPABILITY-SPECIFIC chain it was drawn from — the same number the Operator's own drag-and-drop order showed for this endpoint under this capability, so a diagnostic reader never has to recompute it from array position. */
export interface AuraRouterAttempt {
  endpointId: string;
  provider: ProviderId;
  model: string;
  priority: number;
  success: boolean;
  latencyMs: number;
  failureReason: ProviderFailureReason | null;
  /** The safe, non-secret error message a provider adapter produced — never a raw response body, never a header. */
  errorMessage: string | null;
  usage: ProviderUsage | null;
}

/** The router's final, normalized result — Part 11's `AURAProviderResponse`. Never includes a credential; `text` is the only farmer/operator-facing field, everything else is diagnostics. `capability` records which capability-specific chain actually served this request — never inferred by the caller. */
export interface AuraRouterResult {
  text: string;
  capability: AuraCapability;
  endpointId: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  usage: ProviderUsage | null;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
}

/** Thrown only when EVERY eligible endpoint failed — Part 7's "return a structured failure, never fabricate an answer." */
export class AuraRouterAllFailedError extends Error {
  constructor(
    message: string,
    public readonly attempts: AuraRouterAttempt[],
  ) {
    super(message);
    this.name = "AuraRouterAllFailedError";
  }
}

/**
 * Part 10's canonical, provider-independent request — wraps the SAME
 * `AuraMessage[]` array `prompt-builder.ts`'s `buildMessagesForProvider`
 * already assembles (one system message with the full stable+dynamic AURA
 * context, context-selection already applied, plus the recent
 * conversation window) so the router never regenerates or duplicates
 * context construction (Part 9 — the single most important rule of this
 * phase).
 */
export interface AuraCanonicalRequest {
  messages: AuraMessage[];
  temperature: number;
  capability: AuraCapability;
  /** For server-side diagnostics only (Part 30) — never shown to the Farmer, never used for anything but log correlation. */
  requestId: string;
  /**
   * AURA Context Intelligence & Provider
 * Utilization — a real, non-fabricated estimate of this
   * REQUEST's own input size (`Math.ceil(JSON.stringify(messages).length /
   * 4)`, computed once in `route.ts` from the ACTUAL canonical messages
   * this request carries — never a guess made before the prompt is built).
   * `undefined` for a caller that doesn't supply it (the legacy Operator
   * router-test route, manual-mode benchmarking) — in which case context-
   * size filtering is simply skipped, exactly the earlier behavior.
   * Used ONLY to skip an endpoint whose verified practical per-request
   * token ceiling (`model-catalog.ts`'s `CatalogModel.contextWindowTokens`)
   * is smaller than this estimate — never used for anything else, and
   * never overrides the Operator's own configured fallback order or
   * capability chain ("must NOT bypass the existing provider
   * router").
   */
  estimatedInputTokens?: number;
}

/**
 * The common adapter interface every provider implementation satisfies
 * (Part 11's `AURAProviderAdapter`). Neither method ever throws a raw
 * provider-specific error type to its caller — every adapter normalizes
 * its own failures into `ProviderTemporaryError` (reusing the EXISTING
 * `providers/provider.ts` type, not a second error hierarchy) or a plain
 * `Error` for a non-fallback-eligible failure (Part 8's INVALID_REQUEST).
 *
 * Added `stream`, the
 * streaming twin of `generate`: calls `onDelta` once per text chunk as it
 * arrives and resolves with whatever usage the provider reported (or
 * `null`). Every endpoint's adapter implements both — `createAdapterFor
 * Endpoint` (`endpoint-registry.ts`) reuses each provider's own EXISTING
 * `streamChat()` (Groq/OpenRouter singletons) or the new `streamWithApiKey`
 * (Gemini) — never a second, duplicated request-shaping path per method.
 */
export interface AuraProviderAdapter {
  readonly endpointId: string;
  generate(request: AuraCanonicalRequest, signal?: AbortSignal): Promise<{ text: string; usage: ProviderUsage | null }>;
  stream(request: AuraCanonicalRequest, onDelta: (delta: string) => void, signal?: AbortSignal): Promise<{ usage: ProviderUsage | null }>;
  /**
   * OPTIONAL: only present when
   * `createAdapterForEndpoint` (`endpoint-registry.ts`) builds an adapter for
   * an endpoint whose catalog model is actually registered under
   * `"speech_to_text"` (today: Groq's `whisper-large-v3`/`-turbo` — see
   * `model-catalog.ts`'s own live-verification note). A dedicated method
   * rather than overloading `generate` — transcription's request/response
   * shape (audio bytes in, plain transcript out) has nothing in common with
   * a chat completion, so forcing it through `AuraCanonicalRequest`'s
   * `messages` array would be a fiction, not a genuine reuse.
   */
  /**
   * `language`, an
   * OPTIONAL ISO-639-1 code, added after LIVE evidence (not assumed) that
   * Whisper's own auto-detection can mis-classify spoken Urdu as Hindi and
   * transcribe it in Devanagari script instead of Urdu's own Perso-Arabic
   * script — verified by a direct real call to Groq's `/audio/
   * transcriptions` endpoint with and without this parameter (see the
   * The earlier Urdu STT Results). `undefined` (every existing
   * caller before this change) behaves exactly as before — Whisper's own
   * auto-detect, unchanged for English/other languages.
   */
  transcribe?(audio: AuraAudioAttachment, signal?: AbortSignal, language?: string): Promise<AuraTranscriptionResult>;
  /**
   * OPTIONAL, mirrors `transcribe` above — only present for an endpoint
   * registered under `"text_to_speech"` (today: Gemini's
   * `gemini-3.1-flash-tts-preview`, live-verified this change — see
   * `model-catalog.ts`).
   */
  synthesizeSpeech?(text: string, signal?: AbortSignal): Promise<AuraSpeechResult>;
}

/** The audio-input twin of `AuraImageAttachment` (`../types.ts`), deliberately identical shape (`mimeType` + `dataBase64`) so the same base64-attachment convention this project already uses for images extends naturally to audio, without a third, differently-shaped attachment type. */
export interface AuraAudioAttachment {
  mimeType: string;
  dataBase64: string;
}

/** The result of one `transcribe()` call — never includes the original audio bytes back (nothing this project needs them for after transcription), only the real, provider-reported usage (never fabricated — `null` when unreported, same convention as `ProviderUsage` elsewhere). */
export interface AuraTranscriptionResult {
  text: string;
  usage: ProviderUsage | null;
  /**
   * The provider's OWN detected language for this
   * exact transcription, already normalized to the product's two
   * supported values (`lib/aura/voice/language-detection.ts`'s
   * `normalizeDetectedLanguage`) — never a raw provider string, never a
   * third language. `undefined` when the provider didn't report one, or
   * reported something this product doesn't support (e.g. Hindi) — a
   * caller must treat `undefined` as "no confident per-turn detection,"
   * never assume English by reading this field alone.
   */
  detectedLanguage?: ConversationLanguage;
}

/** The result of one `synthesizeSpeech()` call — raw audio bytes, base64-encoded (same convention as `AuraAudioAttachment`/`AuraImageAttachment`), plus the real MIME type the provider actually returned (never assumed/hardcoded — see `gemini-provider.ts`'s own `synthesizeSpeechWithApiKey`). */
export interface AuraSpeechResult {
  audioBase64: string;
  mimeType: string;
  usage: ProviderUsage | null;
  /** How long THIS adapter call itself spent wrapping raw PCM into a WAV container (see `gemini-provider.ts`'s own `wrapPcmAsWav`), isolated from Gemini's own network/generation time. `undefined` when the response needed no wrapping (already a container format) — never fabricated as `0`. */
  wrapMs?: number;
}

/** The router-level result of a full `transcribeAudio()` call (chain walk + fallback) — mirrors `AuraRouterResult`'s shape for the text/image path, never a credential, `attempts` for the same Operator-diagnostic purpose. */
export interface AuraTranscribeRouterResult {
  text: string;
  endpointId: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  usage: ProviderUsage | null;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
  /** Forwarded unchanged from the winning attempt's own `AuraTranscriptionResult.detectedLanguage` (see that field's own doc comment). */
  detectedLanguage?: ConversationLanguage;
}

/** The router-level result of a full `synthesizeSpeechRequest()` call — mirrors `AuraTranscribeRouterResult` above. */
export interface AuraSpeechRouterResult {
  audioBase64: string;
  mimeType: string;
  endpointId: string;
  provider: ProviderId;
  model: string;
  latencyMs: number;
  usage: ProviderUsage | null;
  fallbackCount: number;
  attempts: AuraRouterAttempt[];
  /** See `AuraSpeechResult.wrapMs`'s own doc comment; passed straight through from whichever endpoint's adapter actually served the request. */
  wrapMs?: number;
}
