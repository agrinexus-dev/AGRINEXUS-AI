/**
 * The ONE place both halves of language detection live:
 * normalizing whatever a provider reports and detecting Urdu vs
 * English in TYPED text with no network call (Phase E). Deliberately a
 * single small, dependency-free file, not a general multilingual engine —
 * per the explicit "keep the helper small, deterministic,
 * testable, reusable" instruction.
 *
 * The product's supported conversational language set is exactly two
 * values, and nothing here ever produces a third:
 */
export type ConversationLanguage = "en" | "ur";

/**
 * Phase B — normalizes a raw language identifier (from Groq/Whisper's own
 * `verbose_json` response, e.g. `"english"`, `"urdu"`, `"en"`, `"ur"`, or
 * any other value including `"hindi"`/`"punjabi"`/`"sindhi"`/`"arabic"`)
 * into the product's own two-value set — or `undefined` if it's anything
 * else at all.
 *
 * This is a strict ALLOWLIST, not a denylist: only the exact known English/
 * Urdu spellings map to a real value. Everything else — including a
 * genuinely real language Whisper might legitimately detect, like Hindi —
 * returns `undefined` rather than being silently accepted. This is the
 * literal mechanism that keeps the product from "silently switching into
 * Hindi/Punjabi/Sindhi" (the explicit requirement):
 * Whisper is free to tell us it thinks the audio was Hindi, but nothing
 * downstream of this function ever treats that as a supported,
 * actionable value — it becomes `undefined`, which every caller in this
 * milestone treats as "no confident detection," never as "the Farmer is
 * now using Hindi."
 */
export function normalizeDetectedLanguage(raw: string | null | undefined): ConversationLanguage | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "en" || normalized === "english") return "en";
  if (normalized === "ur" || normalized === "urdu") return "ur";
  return undefined;
}

// Unicode ranges Urdu's own Perso-Arabic script actually occupies (Arabic,
// Arabic Supplement, Arabic Extended-A, Arabic Presentation Forms A/B —
// the same script family the rest of this codebase already keys off of
// informally in `command-parser.ts`'s own `URDU_PLOT_LETTER`/
// `URDU_QUESTION_MARKERS` literals, just expressed here as a real Unicode
// range instead of a fixed word list, since typed free-text can contain
// any Urdu vocabulary, not just the handful of words those two constants
// care about).
//
// Requires TWO OR MORE consecutive script characters (`{2,}`) rather than
// matching a single stray character — a lone combining mark or an
// incidental single codepoint should not flip an otherwise-English
// message to Urdu; a real word does not have that problem.
const URDU_SCRIPT_RUN = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]{2,}/;

/**
 * Phase E — the typed-text detector. Deliberately NOT a general language-
 * identification engine: it answers exactly one question — "does this
 * message contain meaningful Urdu-script content?" — using nothing but a
 * Unicode-range check, no network call, no LLM call, no external package.
 *
 * Mixed-language messages (e.g. "Plot C کی فصل کیسی ہے؟", this project's
 * own real farm-entity-name convention of keeping plot/drone/robot names
 * in Latin script even inside an Urdu sentence) are classified `"ur"` the
 * moment ANY real Urdu-script word is present, per this change's own
 * "detect Urdu when meaningful Urdu-script content is present and the
 * message is clearly Urdu-led" instruction — a message this codebase's
 * own real data already trains us to expect will often mix a Latin plot/
 * vehicle name into an otherwise-Urdu sentence.
 *
 * Empty/whitespace-only input, and any non-Urdu non-English script
 * (Devanagari, Cyrillic, Chinese, etc. — none of which fall in the Arabic
 * Unicode ranges checked here), both fall through to the safe default,
 * `"en"` — never a fabricated third language, exactly as this change
 * requires ("do not invent a language").
 */
export function detectTextLanguage(text: string): ConversationLanguage {
  if (URDU_SCRIPT_RUN.test(text)) return "ur";
  return "en";
}

/** The exact system-prompt-facing label `prompt-builder.ts`'s own EXISTING `languageInstructionFor`/`URDU_FARMER_GUIDANCE` already expect (`context.preferredLanguage`) — kept here, next to the detector that produces the underlying `en`/`ur` value, so no second mapping table exists anywhere else in the codebase. */
export function conversationLanguageLabel(language: ConversationLanguage): "English" | "Urdu" {
  return language === "ur" ? "Urdu" : "English";
}

// Devanagari Unicode block (U+0900–U+097F) — Hindi's own script. Same
// "2+ consecutive characters" threshold as `URDU_SCRIPT_RUN` above, for the
// same reason (a lone stray codepoint shouldn't trigger anything).
const DEVANAGARI_SCRIPT_RUN = /[ऀ-ॿ]{2,}/;

/**
 * A narrow SIGNAL, not a
 * language classifier. This answers exactly one question: "does this text
 * contain a real run of Devanagari script?" It is used by
 * `/api/aura/voice/transcribe/route.ts` for exactly one purpose: detecting
 * the specific, already-reproduced Groq/Whisper failure signature (a
 * hint-free request whose OWN `language` field came back unsupported/absent
 * AND whose transcript is in Devanagari) as the DETERMINISTIC TRIGGER for a
 * single, targeted recovery re-request — never as a basis for calling the
 * text "Urdu." See that route's own doc comment for the full reasoning on
 * why re-querying the provider (not reinterpreting this text) is the only
 * thing ever done with a `true` result here.
 */
export function containsDevanagariScript(text: string): boolean {
  return DEVANAGARI_SCRIPT_RUN.test(text);
}
