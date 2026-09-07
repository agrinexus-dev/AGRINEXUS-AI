import type { AuraCapability } from "./types";
import type { ProviderId } from "../types";

/**
 * AURA Dynamic Provider + Model Routing Control
 * Center — the verified PROVIDER → CREDENTIAL → MODEL catalog the Operator
 * "Add Model" flow reads from. Nothing here is invented: every entry below
 * was checked against a REAL API response this change (see the file-level
 * dated comment on each provider's list for the exact evidence), never
 * assumed from a model name "sounding right." Adding a new verified model
 * later means adding one entry to one array — the routing engine
 * (`aura-router.ts`) never branches on a specific model or provider name.
 *
 * `availability`:
 *  - `"available"` — a real, successful (or, for `groq`, a real 200 from
 *  Groq's own `/models` list) response was observed THIS PHASE.
 *  - `"unstable"` — a real model that exists and has answered successfully
 *  in this project before, but returned a transient (not "does not
 * exist") error the moment it was checked this change — still
 *  selectable, Operator should know it's had a rough moment recently.
 *  - `"unavailable"` — a real, live-verified rejection (a genuine 404/
 *  retirement message, or a documented permanent zero-quota 429) —
 *  included in the catalog for transparency (so an Operator sees WHY a
 *  plausible-sounding model isn't offered) but NEVER selectable as a
 *  production endpoint (Part "do not make it a selectable production
 *  endpoint").
 *
 * This file intentionally holds ONLY catalog data (what models exist and
 * whether they currently work) — never a live API key, never routing
 * priority (that's `AuraRouteEndpoint` rows, persisted in Postgres — see
 * `endpoint-registry.ts`), never adapter/request logic (that stays in each
 * `providers/*-provider.ts` file).
 */

export type ModelAvailability = "available" | "unstable" | "unavailable";

export interface CatalogModel {
  model: string;
  displayName: string;
  capabilities: AuraCapability[];
  availability: ModelAvailability;
  /** Why `availability` is what it is — always a real, dated, checkable observation, never a guess. */
  note: string;
  /**
   * AURA Context Intelligence & Provider
 * Utilization — this endpoint's VERIFIED, real, practical
   * per-request token ceiling — deliberately NOT always the model's raw
   * architectural context window. For most models these are the same
   * number (Gemini/OpenRouter, all verified via each provider's own real
   * `/models` metadata this change). For Groq's `qwen`/`gpt-oss` models,
   * this is instead the ACCOUNT's real, live-reproduced tokens-per-minute
   * (TPM) rate limit (8,000 — see this file's own dated note below), which
   * this change discovered is the TRUE reason those models were failing
   * `context_limit`-classified errors, NOT their real 131,072-token
   * architectural window (verified via Groq's own `/models` response) —
   * using the raw window here would have been technically accurate but
   * practically useless, since a single request near that size would still
   * always be rejected by this account's actual rate limit. `undefined`
   * only for STT/TTS models, where "input token budget" isn't a meaningful
   * concept for this project's own request shapes (audio in / audio out,
   * not a text prompt) — `aura-router.ts`'s context-size filter is a no-op
   * for a `capability` other than `text`/`image`.
   */
  contextWindowTokens?: number;
}

export interface ProviderCatalogEntry {
  provider: ProviderId;
  label: string;
  /**
   * Every environment variable name this provider has a REAL, distinct
   * credential for today (Part "DO NOT remove/merge/expose these"). Gemini
   * has three because this project genuinely holds three separate Gemini
   * API keys; Groq/OpenRouter have exactly one each. The Operator picks
   * one of these when adding a model under this provider — the model
   * itself never determines the credential.
   */
   credentialEnvVars: string[];
  models: CatalogModel[];
}

// ---------------------------------------------------------------------------
// GEMINI — re-verified live this change (2026-08-31) via real
// `generateContent`/`ListModels` calls against `GEMINI_API_KEY`:
//  - gemini-3.6-flash: 200 OK (already this project's gemini-1 model).
//  - gemini-3.5-flash: 200 OK (already this project's gemini-2 model).
//  - gemini-3.1-flash-lite: 200 OK (already this project's gemini-3 model).
// gemini-3.5-flash-lite: NEW this change — real 200 OK, real usage
//  (promptTokenCount 8 / totalTokenCount 9), not previously configured.
//  - gemini-3.7-flash: a REAL model (present in ListModels) but returned a
//  genuine 503 "currently experiencing high demand" at check time — an
//  availability/capacity error, not a "does not exist" error. Listed as
//  `unstable`, not `unavailable`.
//  - gemini-2.5-flash / gemini-2.5-flash-lite: STILL appear in `ListModels`
//  output, but a real `generateContent` call to either returns a genuine
//  404 — "This model... is no longer available to new users. Please
//  update your code to use models/gemini-3.6-flash [or gemini-3.5-flash-
//  lite]" — Google's own error message, quoted verbatim. `ListModels`
//  listing a model is NOT proof it actually answers; this project trusts
//  the real inference call, not the catalog listing.
//  - gemini-3.1-pro-preview: real, permanent 429 "Quota exceeded... limit:
//  0" observed live — this account's free tier has zero quota for
//  the Pro tier, a structural rejection, not transient.
// ---------------------------------------------------------------------------
const GEMINI_CATALOG: ProviderCatalogEntry = {
  provider: "gemini",
  label: "Google Gemini",
  credentialEnvVars: ["GEMINI_API_KEY", "GEMINI_2_API_KEY", "GEMINI_3_API_KEY", "GEMINI_4_API_KEY"],
  models: [
    // `contextWindowTokens` below: real `inputTokenLimit` from a live
    // `ListModels` response, 2026-09-02 — every current Gemini
    // Flash model reports 1,048,576, comfortably above anything this
    // project's own context ever approaches.
    { model: "gemini-3.6-flash", displayName: "Gemini 3.6 Flash", capabilities: ["text", "image"], availability: "available", note: "Live 200 OK, 2026-08-31.", contextWindowTokens: 1_048_576 },
    { model: "gemini-3.5-flash", displayName: "Gemini 3.5 Flash", capabilities: ["text", "image"], availability: "available", note: "Live 200 OK, 2026-08-31.", contextWindowTokens: 1_048_576 },
    { model: "gemini-3.5-flash-lite", displayName: "Gemini 3.5 Flash-Lite", capabilities: ["text", "image"], availability: "available", note: "Live 200 OK, 2026-08-31 — real usage reported (9 total tokens for a 1-word reply).", contextWindowTokens: 1_048_576 },
    { model: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash-Lite", capabilities: ["text", "image"], availability: "available", note: "Live 200 OK, 2026-08-31.", contextWindowTokens: 1_048_576 },
    { model: "gemini-3.7-flash", displayName: "Gemini 3.7 Flash", capabilities: ["text", "image"], availability: "unstable", note: "Real model (listed by ListModels) but returned a live 503 'currently experiencing high demand' on 2026-08-31 — not a does-not-exist error, but not confirmed answering right now either.", contextWindowTokens: 1_048_576 },
    { model: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", capabilities: ["text", "image"], availability: "unavailable", note: "Live 404 on 2026-08-31: \"no longer available to new users\" — Google's own message recommends gemini-3.6-flash." },
    { model: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash-Lite", capabilities: ["text", "image"], availability: "unavailable", note: "Live 404 on 2026-08-31: \"no longer available to new users\" — Google's own message recommends gemini-3.5-flash-lite." },
    { model: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro (Preview)", capabilities: ["text", "image"], availability: "unavailable", note: "Real, permanent 429 'Quota exceeded... limit: 0' (MVP-3A.1) — this account's free tier has zero quota for this model." },
    // -------------------------------------------------------------------
    // AURA Multi-Key, Multi-Model & Capability-Aware Provider
 // Pool — TEXT_TO_SPEECH, verified live 2026-09-01: a real
    // `generateContent` call (NOT the `bidiGenerateContent` WebSocket API —
    // see this file's own note on the excluded `-live`/`-native-audio`
    // models below) with `generationConfig.responseModalities: ["AUDIO"]`
    // and a `speechConfig.voiceConfig.prebuiltVoiceConfig` returned a real
    // 200 OK with actual inline audio bytes (`audio/l16; rate=24000;
    // channels=1`, 76800 bytes for a 1-sentence test phrase). This is the
    // ONE Gemini model this change found that produces audio through the
    // SAME request/response HTTP shape this project's adapters already use
    // — genuinely wireable without a new transport layer.
    { model: "gemini-3.1-flash-tts-preview", displayName: "Gemini 3.1 Flash TTS (Preview)", capabilities: ["text_to_speech"], availability: "available", note: "Live 200 OK, 2026-09-01 — real inline audio/l16 PCM bytes returned via a standard generateContent call (responseModalities: [\"AUDIO\"])." },
    // `ListModels` (2026-09-01) also surfaced `gemini-3.5-transcribe-live`,
    // `gemini-3.1-flash-live-preview`, and the `gemini-2.5-flash-native-
    // audio-*` family — all real, but every one of them only supports
    // `bidiGenerateContent` (a persistent WebSocket session), a
    // fundamentally different transport than the request/response HTTP
    // calls every adapter in this project makes today. Deliberately NOT
    // added to this catalog this change ("prepare routing
    // infrastructure," not "build a new transport layer") — a genuine,
    // verified capability gap, not an oversight;
    // own "Remaining limitations" section.
  ],
};

// ---------------------------------------------------------------------------
// GROQ — re-verified live this change (2026-08-31) via a real
// `GET https://api.groq.com/openai/v1/models` call with `GROQ_API_KEY`
// (200 OK). Excludes whisper-*/*.-guard-*/tts/orpheus (not chat-completion
// models) automatically, same convention `provider-meta.ts` already
// documents. `groq/compound`/`groq/compound-mini` ARE real, live-listed
// models, but are Groq's agentic "compound" systems (built-in tool use,
// e.g. live web search) — a materially different behavior contract than a
// plain chat-completions model, unverified for this project's system-prompt
// design, so listed as `unavailable` here (not because the model doesn't
// exist, but because it isn't verified SAFE/SUITABLE for AURA's use case —
// see this catalog's own `note`). `allam-2-7b` is a real, plain
// chat-completions model (Arabic-specialized) — included as `available`
// since it answers the same API shape, without being recommended as a
// default.
// ---------------------------------------------------------------------------
const GROQ_CATALOG: ProviderCatalogEntry = {
  provider: "groq",
  label: "Groq",
  credentialEnvVars: ["GROQ_API_KEY", "GROQ_2_API_KEY", "GROQ_3_API_KEY", "GROQ_4_API_KEY"],
  models: [
    // -------------------------------------------------------------------
    // `contextWindowTokens` re-verified live, 2026-09-02. Groq's own
    // `/models` response reports a raw `context_window` of 131,072 for
    // every one of these four models — but a REAL reproduced request at
    // ~48K characters (~15,568 tokens) returned a live 413:
    //  "Request too large for model `qwen/qwen3.6-27b`... on tokens per
    //  minute (TPM): Limit 8000, Requested 15568... rate_limit_exceeded"
    // — confirmed independently on BOTH configured Groq organizations
    // (GROQ_API_KEY and GROQ_2_API_KEY each report their own, separate
    // 8,000 TPM ceiling). This is THE actual root cause observed
    // as "context_limit" on 100% of tested voice requests — a real,
    // account-tier TPM rate limit, not the model's own architectural
    // window. `contextWindowTokens: 8000` records the VERIFIED PRACTICAL
    // ceiling ("do not hard-code arbitrary budgets — examine
    // actual provider limits"), not the (true but practically irrelevant)
    // 131,072 figure — using the real number here is what lets
    // `aura-router.ts` correctly skip these endpoints for a genuinely
    // large request instead of learning it the hard way on every attempt.
    { model: "openai/gpt-oss-20b", displayName: "GPT-OSS 20B", capabilities: ["text"], availability: "available", note: "Live-listed 2026-08-31; this project's current default (fastest of the three general-chat candidates).", contextWindowTokens: 8_000 },
    { model: "openai/gpt-oss-120b", displayName: "GPT-OSS 120B", capabilities: ["text"], availability: "available", note: "Live-listed 2026-08-31.", contextWindowTokens: 8_000 },
    { model: "qwen/qwen3.8-27b", displayName: "Qwen3.8 27B", capabilities: ["text"], availability: "available", note: "Live-listed 2026-08-31.", contextWindowTokens: 8_000 },
    { model: "qwen/qwen3.6-27b", displayName: "Qwen3.6 27B", capabilities: ["text"], availability: "available", note: "Live-listed 2026-08-31 — newly observed, not previously configured.", contextWindowTokens: 8_000 },
    // allam-2-7b's real architectural window (4,096, per Groq's own
    // `/models` `context_window` field, 2026-09-02) is itself SMALLER than
    // the 8,000 TPM ceiling above — its own raw window is the binding
    // constraint here, not the account's rate limit, so this one genuinely
    // is a model-capability number, not a rate-limit substitute.
    { model: "allam-2-7b", displayName: "Allam 2 7B", capabilities: ["text"], availability: "available", note: "Live-listed 2026-08-31 — a plain chat-completions model (Arabic-specialized); not recommended as AURA's default, included for completeness.", contextWindowTokens: 4_096 },
    { model: "groq/compound", displayName: "Groq Compound", capabilities: ["text"], availability: "unavailable", note: "Live-listed 2026-08-31, but an agentic tool-use system (e.g. built-in web search), not a plain chat model — unverified/unsuitable for AURA's controlled system-prompt design." },
    { model: "groq/compound-mini", displayName: "Groq Compound Mini", capabilities: ["text"], availability: "unavailable", note: "Same reasoning as groq/compound above." },
    // -------------------------------------------------------------------
    // SPEECH_TO_TEXT. Both real, live-listed
    // (`GET /openai/v1/models`, 2026-09-01) AND independently verified with
    // a genuine transcription call (`POST /openai/v1/audio/transcriptions`,
    // a real minimal WAV file, not a text prompt guessed to "sound like"
    // audio input) — 200 OK for both, a real (if Whisper-artifact-typical
    // hallucinated-on-silence) transcript returned. Registering ONLY these
    // two specific models under `speech_to_text`, never Groq's other/newer
    // chat models — Part 9's own explicit warning ("that does not mean
    // every Groq text model should appear as a speech-to-text model").
    { model: "whisper-large-v3-turbo", displayName: "Whisper Large V3 Turbo", capabilities: ["speech_to_text"], availability: "available", note: "Live-listed AND live-verified 2026-09-01 — real 200 OK from a genuine /audio/transcriptions call against a real WAV file." },
    { model: "whisper-large-v3", displayName: "Whisper Large V3", capabilities: ["speech_to_text"], availability: "available", note: "Live-listed AND live-verified 2026-09-01 — same real transcription-call verification as the Turbo variant." },
    // TEXT_TO_SPEECH — real, live-listed models, but BOTH returned a real,
    // structural 400 `model_terms_required` ("Please have the org admin
    // accept the terms...") on a genuine `/audio/speech` call, 2026-09-01 —
    // not a "does not exist" error, and not fabricatable/bypassable from
    // this codebase (Part "FINAL RULE": no quota/terms circumvention).
    // Cataloged as `unavailable` (same convention as `gemini-3.1-pro-
    // preview`'s zero-quota entry above) so an Operator sees WHY these
    // exist but can't be selected, rather than them silently not appearing.
    { model: "canopylabs/orpheus-v1-english", displayName: "Orpheus v1 (English TTS)", capabilities: ["text_to_speech"], availability: "unavailable", note: "Live-listed 2026-09-01; a real /audio/speech call returned 400 model_terms_required — org has not accepted this model's terms in the Groq console. Structural, not a routing bug." },
    { model: "canopylabs/orpheus-arabic-saudi", displayName: "Orpheus Arabic/Saudi (TTS)", capabilities: ["text_to_speech"], availability: "unavailable", note: "Same model_terms_required 400, verified independently, 2026-09-01." },
  ],
};

// ---------------------------------------------------------------------------
// OPENROUTER — re-verified live this change (2026-08-31) via a real, public,
// unauthenticated `GET https://openrouter.ai/api/v1/models` call (no key
// needed for listing). Free-tier eligibility checked by literal
// `pricing.prompt === "0" && pricing.completion === "0"` on each entry, not
// assumed from the ":free" suffix alone.
//
// Gemini on OpenRouter was explicitly investigated (Part "OpenRouter:
// Gemini 2.5 Flash / Flash-Lite") — every `google/gemini-*` entry currently
// listed carries NONZERO pricing (the cheapest, `gemini-2.5-flash-lite`, is
// still $0.0000001/prompt-token) — there is NO free Gemini variant on
// OpenRouter today. Not included in this catalog as a selectable option;
// documented here so the question doesn't need re-asking.
//
// Audio/voice was also checked this change: the public
// model list DOES include free, audio-input-capable entries (e.g.
// `thinkingmachines/inkling-small:free`, input modalities `text/image/
// audio`, output `text` only — audio UNDERSTANDING, not transcription or
// speech synthesis). Deliberately NOT added to this catalog — it has never
// been exercised with a real audio request in this project (Part 32: don't
// burn quota confirming a candidate that doesn't clearly fill a gap already
// covered by a verified Groq/Gemini option), and its output shape (a text
// reply about the audio, not a literal transcript) doesn't match this
// project's `speech_to_text` capability contract. Noted here as a real,
// observed candidate for a future phase, not fabricated, not registered.
// ---------------------------------------------------------------------------
const OPENROUTER_CATALOG: ProviderCatalogEntry = {
  provider: "openrouter",
  label: "OpenRouter (Free)",
  credentialEnvVars: ["OPENROUTER_API_KEY", "OPENROUTER_2_API_KEY", "OPENROUTER_3_API_KEY", "OPENROUTER_4_API_KEY"],
  models: [
    // `contextWindowTokens`: real `context_length` from OpenRouter's own
    // public `/models` response, 2026-09-02 — no TPM-style
    // account rate limit was found for any of these on the free tier
    // (unlike Groq — see that catalog's own note); the raw context length
    // is the real, relevant ceiling here.
    { model: "nvidia/nemotron-3-super-120b-a12b:free", displayName: "Nemotron 3 Super 120B (Free)", capabilities: ["text"], availability: "available", note: "Live $0/$0 pricing 2026-08-31; this project's current default fallback.", contextWindowTokens: 262_144 },
    { model: "google/gemma-4-31b-it:free", displayName: "Gemma 4 31B IT (Free)", capabilities: ["text"], availability: "available", note: "Live $0/$0 pricing 2026-08-31.", contextWindowTokens: 262_144 },
    { model: "z-ai/glm-5.2:free", displayName: "GLM 5.2 (Free)", capabilities: ["text"], availability: "available", note: "Live $0/$0 pricing 2026-08-31.", contextWindowTokens: 256_000 },
    { model: "nvidia/nemotron-3.5-lightning:free", displayName: "Nemotron 3.5 Lightning (Free)", capabilities: ["text"], availability: "available", note: "Live $0/$0 pricing 2026-08-31 — new candidate, not previously configured.", contextWindowTokens: 1_000_000 },
    { model: "minimax/minimax-m3:free", displayName: "MiniMax M3 (Free)", capabilities: ["text"], availability: "available", note: "Live $0/$0 pricing 2026-08-31 — new candidate, not previously configured.", contextWindowTokens: 1_048_576 },
  ],
};

export const AURA_MODEL_CATALOG: ProviderCatalogEntry[] = [GEMINI_CATALOG, GROQ_CATALOG, OPENROUTER_CATALOG];

export function getCatalogForProvider(provider: ProviderId): ProviderCatalogEntry | undefined {
  return AURA_MODEL_CATALOG.find((entry) => entry.provider === provider);
}

export function findCatalogModel(provider: ProviderId, model: string): CatalogModel | undefined {
  return getCatalogForProvider(provider)?.models.find((entry) => entry.model === model);
}
