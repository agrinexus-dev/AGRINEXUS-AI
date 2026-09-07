/**
 * A defense-in-depth safety net, not a prompt-engineering substitute. The
 * system prompt's own `NO_HIDDEN_REASONING` rule (unchanged, `prompt-
 * builder.ts`) already tells every model never to expose a chain-of-
 * thought — and live testing this change confirmed a real, if occasional
 * (roughly 1 in 3 in direct repeated testing), failure to follow it: both
 * a Groq model (`qwen/qwen3.6-27b`, an earlier change's finding) and Gemini
 * (`gemini-3.6-flash`, the finding on an ambiguous-reply
 * turn) sometimes write a literal `<think>...reasoning...</think>` block
 * as the START of their own visible answer, rather than a hidden feature
 * of the API response itself (confirmed: Gemini's real JSON response
 * carries no separate "thought" part for this — the model is choosing to
 * write the tag as ordinary text). Prompt wording changes reduced but did
 * not eliminate this, so this strips a leading think-block server-side —
 * the one place both the streaming and non-streaming paths already
 * converge — so it can NEVER reach the Farmer regardless of which
 * provider/model answered or how it phrased things this time.
 *
 * Deliberately narrow: only a THINK block at the very START of the reply
 * is stripped (a legitimate answer that happens to mention "think" or
 * contains an unrelated "<" character elsewhere is never touched).
 */

const LEADING_THINK_BLOCK = /^\s*<think>[\s\S]*?<\/think>\s*/i;

/** Non-streaming: the full text is already available — strip synchronously. */
export function stripLeadingThinkBlock(text: string): string {
  return text.replace(LEADING_THINK_BLOCK, "");
}

/**
 * Streaming: deltas arrive one small chunk at a time, so a full regex
 * match isn't available until enough of the block has streamed in. This
 * buffers ONLY while the accumulated text so far is still a genuine,
 * unresolved PREFIX of the literal string `"<think>"` — the moment it
 * diverges (or completes into the full tag), a decision is made — so a
 * real answer is delayed by at most 7 characters (`"<think>".length`)
 * regardless of how small the provider's own chunking is, and a genuine
 * think-block is fully swallowed once `</think>` closes it.
 *
 * AURA Reliability, Latency & Context
 * Optimization — TWO real bugs found and fixed this change in the
 * ORIGINAL version of this function, both confirmed via a
 * direct, reproducible unit-level test before being fixed:
 *
 * 1. THE REAL ROOT CAUSE of an earlier change's reported "conversation-
 *  persistence flakiness" ("Tomatoes." reaching the UI but not being
 *  persisted): the original filter had no way to know when the stream
 *  had genuinely ENDED. A complete reply shorter than its old fixed
 *  `PEEK_LIMIT` (8 characters — e.g. "OK.", "Noted.") never crossed the
 *  threshold that would have released it, so the buffered text sat
 *  there FOREVER once the provider stopped sending deltas — never
 *  reaching `onDelta` at all, hence never appearing in the UI and never
 *  persisted (persistence itself was never buggy; it correctly never
 *  persists an empty string because the content genuinely never
 *  arrived). Reproduced directly: a simulated "OK." stream (3
 *  characters, two small chunks) was silently swallowed with zero
 *  output. Fixed by `flush()` below — the caller (`route.ts`) calls it
 *  exactly once, the instant it knows generation is genuinely complete,
 *  guaranteeing any still-buffered, never-decided content is released.
 * 2. A separate, real correctness gap in the ORIGINAL early-decision
 *  heuristic (`/<\/?[a-z]/i.test(trimmedStart)`, now removed): it
 *  treated ANY tag-like prefix as "not a think-block" the instant it
 *  appeared, even a genuine, still-incomplete PREFIX of "<think>"
 *  itself (e.g. a provider chunking its response as `"<thi"` then
 * `"nk>reasoning..."` — reproduced directly this change) — the real
 *  `<think>` tag would then slip through unfiltered. The current
 *  version compares only against the one literal string that actually
 *  matters (`THINK_OPEN`), so it can never misfire on its own tag.
 */
const THINK_OPEN = "<think>";

export interface ThinkBlockFilter {
  onDelta: (delta: string) => void;
  /**
   * Call exactly once, the instant the underlying stream has genuinely
   * ended (no more deltas will ever arrive for this attempt) — releases
   * any content still sitting in the buffer because the filter never
   * reached a decision. Idempotent-safe (a second call is a no-op) but
   * only ever needs calling once per real stream.
   */
  flush: () => void;
}

export function createThinkBlockFilter(onDelta: (delta: string) => void): ThinkBlockFilter {
  let buffer = "";
  let resolved = false; // true once we've decided this reply is (or isn't) a think-block.
  let sawThinkOpen = false;

  function handleDelta(delta: string): void {
    if (resolved) {
      onDelta(delta);
      return;
    }

    buffer += delta;

    if (!sawThinkOpen) {
      const trimmedStart = buffer.trimStart();
      const lower = trimmedStart.toLowerCase();
      // Still a genuine, unresolved prefix of "<think>" itself (e.g. just
      // "<" or "<thi") — wait for more before deciding either way; this
      // can never buffer more than `THINK_OPEN.length` (7) characters
      // before resolving one way or the other.
      if (lower.length < THINK_OPEN.length && THINK_OPEN.startsWith(lower)) {
        return;
      }
      if (lower.startsWith(THINK_OPEN)) {
        sawThinkOpen = true;
      } else {
        // Definitively not a think-block — either it diverged from
        // "<think>" partway through, or it never looked like it at all.
        resolved = true;
        onDelta(buffer);
        buffer = "";
        return;
      }
    }

    const closeIndex = buffer.search(/<\/think>/i);
    if (closeIndex === -1) return; // still inside the think-block — keep buffering, forward nothing yet.

    resolved = true;
    const remainder = buffer.slice(closeIndex).replace(/^<\/think>\s*/i, "");
    buffer = "";
    if (remainder) onDelta(remainder);
  }

  function flush(): void {
    if (resolved || buffer.length === 0) return;
    resolved = true;
    // With the precise prefix-matching above, an ORDINARY reply (anything
    // not starting with "<") already resolves on its very first delta —
    // this only ever fires for the two remaining edge cases: (a) the
    // entire reply was 6 characters or fewer AND happened to be a literal
    // prefix of "<think>" (vanishingly rare real text), or (b) a real
    // `<think>` block opened but the stream ended before `</think>` ever
    // closed it (a genuinely-truncated-stream edge case). Either way,
    // silently dropping this content is strictly worse than releasing it:
    // a short, entirely ordinary answer must never be swallowed, and even
    // a truncated think-block is better shown (tag stripped) than
    // presenting the farmer with nothing at all for a turn the server
    // genuinely completed.
    const output = buffer.replace(/^<think>/i, "").trimStart();
    buffer = "";
    if (output) onDelta(output);
  }

  return { onDelta: handleDelta, flush };
}
