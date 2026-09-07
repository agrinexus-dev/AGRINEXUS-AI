import "server-only";

import type { AuraMessage } from "../types";
import { getProvider } from "../providers/provider-registry";

/**
 * Automatic conversation titles ("Wheat issue in Plot C",
 * "Yesterday's robot activity"). Reuses the EXISTING provider architecture
 * (a single, tiny, non-streaming `chat()` call) rather than a second AI
 * backend or a hand-rolled summarizer — the same `AIProvider` interface
 * every other AURA request already goes through.
 *
 * Deliberately best-effort: title generation NEVER blocks or fails
 * conversation creation. If every configured provider is unavailable (no
 * key, rate-limited, etc.) this falls back to a deterministic truncation of
 * the user's own words — still a real, meaningful title ("Do not use
 * meaningless random IDs as normal titles" — Part 4), just less polished
 * than an AI paraphrase.
 */

const TITLE_SYSTEM_PROMPT =
  "You generate short conversation titles for a farm-assistant chat app. " +
  "Given the user's first message, reply with ONLY a concise 3-6 word title " +
  "summarizing what it's about — no quotes, no punctuation at the end, no " +
  "preamble. Example: message 'There are yellow spots appearing on my wheat " +
  "in Plot C.' -> title: Wheat issue in Plot C";

const MAX_TITLE_LENGTH = 60;

/** Providers tried in order for title generation — fast/cheap ones first. Falls through silently on any failure (missing key, rate limit, not implemented). */
const TITLE_PROVIDER_ORDER = ["groq", "openrouter", "gemini"] as const;

function sanitizeTitle(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/[.!?]+$/g, "")
    .split("\n")[0]!
    .trim();
  return cleaned.length > MAX_TITLE_LENGTH ? `${cleaned.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : cleaned;
}

/** Never throws — always returns a usable, non-empty title. */
function fallbackTitle(firstMessage: string): string {
  const words = firstMessage.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "New conversation";
  const truncated = words.slice(0, 8).join(" ");
  return truncated.length > MAX_TITLE_LENGTH ? `${truncated.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : truncated;
}

export async function generateConversationTitle(firstMessage: string): Promise<string> {
  const trimmed = firstMessage.trim();
  if (!trimmed) return "New conversation";

  const requestMessages: AuraMessage[] = [
    { id: "title-system", role: "system", content: TITLE_SYSTEM_PROMPT, createdAt: 0 },
    { id: "title-user", role: "user", content: trimmed, createdAt: 0 },
  ];

  for (const providerId of TITLE_PROVIDER_ORDER) {
    const provider = getProvider(providerId);
    if (!provider.meta.implemented) continue;
    try {
      const content = await provider.chat({ model: provider.meta.models[0]!, temperature: 0.3, messages: requestMessages });
      const title = sanitizeTitle(content);
      if (title.length > 0) return title;
    } catch {
      // Best-effort — try the next provider, then the deterministic fallback below.
    }
  }

  return fallbackTitle(trimmed);
}
