import type { ProviderMeta } from "../types";

/**
 * Pure provider metadata (label, model list, implemented flag) — no
 * fetch/env access, safe to import from client components (the Settings
 * panel) as well as the server-only provider classes, which each import
 * their own entry here instead of redeclaring it.
 */
export const GEMINI_META: ProviderMeta = {
  id: "gemini",
  label: "Google Gemini",
  // gemini-2.5-flash/-pro were retired by Google
  // ("no longer available to new users", RE-confirmed live this change too —
  // a real 404 from the actual API explicitly recommends gemini-3.6-flash
  // as the replacement, corroborating this project's own existing choice).
  //
  // This list was corrected after REAL live testing, not assumption:
  // "gemini-3.1-pro-preview" (this array's previous second entry) returned
  // a genuine, permanent 429 — "Quota exceeded... limit: 0" — meaning this
  // account's free tier has ZERO quota for that Pro-tier model, not a
  // transient rate limit. "gemini-3.5-flash" is its real, live-verified-
  // working (200, real response, real usage) replacement — a genuine
  // free-tier-compatible Flash-generation model, distinct from
  // gemini-3.6-flash, giving real benchmarking diversity. See
  // `router/endpoint-registry.ts` for the third model
  // (gemini-3.1-flash-lite, also live-verified this change).
  models: ["gemini-3.6-flash", "gemini-3.5-flash"],
  implemented: true,
};

// The Gemini API key's bound Google Cloud service account was
// disabled (ACCOUNT_STATE_INVALID, outside this codebase's control), so
// OpenRouter (an OpenAI-compatible gateway to many models) was added as a
// second real provider. Every model below was confirmed BOTH live-listed AND
// genuinely $0-priced (prompt and completion pricing both "0") via
// GET https://openrouter.ai/api/v1/models — real ":free" variants, not
// invented. models[0] is the default (see aura-settings-store.ts) and was
// chosen specifically because it was the one confirmed via a live
// POST /chat/completions to actually respond right now.
//
// A model benchmark (live-verified, not assumed) re-checked all four
// as of this change: "nvidia/nemotron-3-nano-30b-a3b:free" now returns a
// real 404 — OpenRouter retired the free slug entirely ("This model is
// unavailable for free... use nvidia/nemotron-3-nano-30b-a3b instead" — a
// paid slug), so it's removed here rather than left as a guaranteed-dead
// option. "gemma-4-31b-it:free" and "glm-5.2:free" were BOTH still 429
// "temporarily rate-limited upstream" (OpenRouter's shared free-pool
// saturation — an account/provider-side condition, not a bug here) —
// kept as listed alternatives since that condition can clear on its own,
// but "nemotron-3-super-120b-a12b:free" remains the only one confirmed
// actually responding right now (with real but highly variable latency,
// observed 3.9s–36s across identical requests in this change's benchmark —
// ) — still `models[0]`, since
// Groq is the real primary provider (see `chat-router.ts`'s
// `PROVIDER_PRIORITY`) and this only matters as the fallback target.
export const OPENROUTER_META: ProviderMeta = {
  id: "openrouter",
  label: "OpenRouter (Free)",
  models: ["nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free", "z-ai/glm-5.2:free"],
  implemented: true,
};

// Groq, a second real provider (OpenAI-compatible chat
// completions, same shape OpenRouter already speaks — see
// `groq-provider.ts`). An early guess here
// ("llama-3.3-70b-versatile") could NOT be live-confirmed at the time (no
// `GROQ_API_KEY` existed anywhere in this project yet) and turned out to be
// wrong — a real key later got a genuine 404 "model does not
// exist" from Groq itself. These three ARE live-confirmed: fetched directly
// from `GET https://api.groq.com/openai/v1/models` with the real configured
// key, a 200 response, real model IDs currently available to
// this account — not guessed. `openai/gpt-oss-20b` is listed first (used as
// the default) as the fastest general-purpose chat model of the three;
// `openai/gpt-oss-120b` and `qwen/qwen3.8-27b` are the other general-chat
// candidates from that same live list (excludes whisper-*
// speech-to-text, *-prompt-guard-* moderation/classifier models, and
// orpheus-* text-to-speech models — none of those speak chat completions).
// `GROQ_MODEL` (server env var, see `groq-provider.ts`'s
// `fallbackGroqModel()`) overrides this for the automatic OpenRouter→Groq
// fallback path specifically, without a code change, if the account's
// available models change again.
export const GROQ_META: ProviderMeta = {
  id: "groq",
  label: "Groq",
  models: ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"],
  implemented: true,
};

export const OPENAI_META: ProviderMeta = {
  id: "openai",
  label: "OpenAI",
  models: ["gpt-4.1", "gpt-4o"],
  implemented: false,
};

export const CLAUDE_META: ProviderMeta = {
  id: "claude",
  label: "Anthropic Claude",
  models: ["claude-sonnet-5", "claude-opus-5"],
  implemented: false,
};

export const OLLAMA_META: ProviderMeta = {
  id: "ollama",
  label: "Ollama (local)",
  models: ["llama3.1", "mistral"],
  implemented: false,
};

export const ALL_PROVIDER_META: ProviderMeta[] = [GEMINI_META, OPENROUTER_META, GROQ_META, OPENAI_META, CLAUDE_META, OLLAMA_META];
