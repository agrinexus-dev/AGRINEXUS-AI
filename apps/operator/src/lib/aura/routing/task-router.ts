import type { ProviderId } from "../types";

/**
 * Deterministic task-category classification
 * for AURA's general conversational path (informational/reasoning
 * questions that reach the LLM — NOT operational requests, which the
 * deterministic parser and the intent classifier already intercept
 * before this router ever runs, unchanged). Classification itself stays
 * 100% deterministic (regex/keyword-based, mirroring `command-parser.ts`'s
 * own established verb-phrase-matching philosophy) — the router decides
 * WHICH MODEL should answer, never what the answer is; the actual reasoning
 * still comes from a real LLM call using the same canonical `AuraContext`
 * either way (one context, regardless of category/model).
 *
 * A misclassification here has low blast radius by design: every category
 * still gets a genuine, fully-context-grounded LLM answer, just possibly
 * from a less-than-ideal model for that specific question — never a wrong
 * EXECUTION path (operational safety is entirely unaffected by this file).
 */
export type AuraTaskCategory = "simple_information" | "farm_reasoning" | "complex_reasoning" | "history_query" | "recommendation" | "general";

const HISTORY_PATTERN = /\b(did|what did|has|have|already|last time|yesterday|previously|before|earlier|when was|when did)\b.*\b(check|inspect|find|found|happen|mission|robot|drone)\b|\b(check|inspect|find|found|happen|mission|robot|drone)\b.*\b(last time|yesterday|previously|already)\b/;
const RECOMMENDATION_PATTERN = /\b(what should i|what to do|worry about|check first|most important|priority|prioriti[sz]e|what needs (my )?attention)\b/;
const COMPLEX_REASONING_PATTERN = /\b(why does|why is|why do|keep(s)? having|keep(s)? happening|same problem|pattern|could .*(be|have) (causing|related|contribut)|relationship between|compare|correlat)\b/;
const FARM_REASONING_PATTERN = /\b(how is my farm|how('s| is) the farm|farm doing|farm okay|farm ok\b|farm health|anything i should (worry|know)|needs? my attention|is my farm)\b/;

/**
 * Order matters — most-specific pattern first, same convention
 * `command-parser.ts`'s own `COMMAND_PATTERNS` array already establishes
 * (a more specific match should never lose to a more generic one).
 */
export function classifyTaskCategory(text: string): AuraTaskCategory {
  const normalized = text.trim().toLowerCase();
  if (HISTORY_PATTERN.test(normalized)) return "history_query";
  if (RECOMMENDATION_PATTERN.test(normalized)) return "recommendation";
  if (COMPLEX_REASONING_PATTERN.test(normalized)) return "complex_reasoning";
  if (FARM_REASONING_PATTERN.test(normalized)) return "farm_reasoning";
  // Short, direct questions default to the fast/simple tier; anything
  // longer/more open-ended without a specific pattern match still gets a
  // real, capable model rather than being starved of reasoning ability.
  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  return wordCount <= 10 ? "simple_information" : "general";
}

export interface ModelSelection {
  provider: ProviderId;
  model: string;
}

/**
 * This table is the DIRECT output of a live model benchmark,
 * not an assumption from model name/parameter count:
 *
 *  - groq/openai-gpt-oss-20b: fastest (283ms–869ms across all 6 benchmark
 *  questions), fully accurate on every question including the
 *  hallucination probe — the right choice for fast lookups and for the
 *  intent-classifier's own extraction task (see
 *  `INTENT_CLASSIFIER_MODEL` below).
 * OpenRouter's free tier was ALSO live-tested and found
 *  unreliable — this is why Groq remains the router's provider for
 *  every category below; OpenRouter stays what it already was
 *  architecturally (the `chat-router.ts` fallback target), not a
 *  routing destination in its own right.
 *
 * `farm_reasoning`/`complex_reasoning`/`recommendation`/`general` were
 * switched from `openai/gpt-oss-120b` to `qwen/qwen3.8-27b`, based on
 * live, verified evidence (small direct-API probes,
 * not run through AURA's full context, to avoid spending the tight shared
 * TPM budget):
 *  - Both share the IDENTICAL Groq free-tier TPM ceiling (8,000) —
 *  verified via Groq's own current rate-limit documentation. Switching
 *  model does NOT, by itself, fix AURA's prompt exceeding that ceiling
 *  — that is a context-size problem, deliberately out of scope here.
 *  - qwen3.8-27b's free-tier TPD is 2,000,000 vs gpt-oss-120b's 200,000 —
 *  a real 10x more total daily capacity on the SAME TPM ceiling, which
 *  is what actually matters for a hackathon demo day surviving many
 *  messages.
 *  - Live side-by-side test (a cross-domain hedging question — "did the
 *  weather cause the wilting?") — both models correctly hedged (never
 *  stated the causal link as confirmed), but gpt-oss-120b spent 489
 *  completion tokens per answer (84 of them an invisible internal
 *  "reasoning" channel) versus qwen3.8-27b's 138 — roughly 3.5x more
 *  output-token cost for a comparably-hedged, comparably-useful answer,
 *  which also better matches AURA's own stated "concise" personality
 *  rule (`prompt-builder.ts`'s `PERSONALITY` block).
 *  - `simple_information`/`history_query` were deliberately left on
 *  `gpt-oss-20b` — already fast and proven, no verified reason to
 *  change it.
 *
 * Provider/model choice here is data, not hardcoded branching — adding a
 * future provider/model to a category means editing this table only.
 */
const CATEGORY_MODEL_TABLE: Record<AuraTaskCategory, ModelSelection> = {
  simple_information: { provider: "groq", model: "openai/gpt-oss-20b" },
  history_query: { provider: "groq", model: "openai/gpt-oss-20b" },
  farm_reasoning: { provider: "groq", model: "qwen/qwen3.8-27b" },
  complex_reasoning: { provider: "groq", model: "qwen/qwen3.8-27b" },
  recommendation: { provider: "groq", model: "qwen/qwen3.8-27b" },
  general: { provider: "groq", model: "qwen/qwen3.8-27b" },
};

export function selectModelForCategory(category: AuraTaskCategory): ModelSelection {
  return CATEGORY_MODEL_TABLE[category];
}

/** The intent-classifier's own model choice — a narrow, always-cheap extraction task, not one of the conversational categories above. Benchmark-confirmed fast and accurate (see `selectModelForCategory`'s own doc comment). */
export const INTENT_CLASSIFIER_MODEL: ModelSelection = { provider: "groq", model: "openai/gpt-oss-20b" };
