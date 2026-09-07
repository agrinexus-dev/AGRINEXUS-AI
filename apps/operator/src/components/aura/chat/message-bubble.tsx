import { cn } from "@agrinexus/ui";

import { useAuraChatStore } from "@/lib/aura/client/aura-chat-store";
import type { AuraMessage } from "@/lib/aura/types";
import { detectTextLanguage } from "@/lib/aura/voice/language-detection";

import { AuraMissionCard } from "./aura-mission-card";
import { MarkdownRenderer } from "./markdown-renderer";
import { TypingIndicator } from "./typing-indicator";

export interface MessageBubbleProps {
  message: AuraMessage;
}

/**
 * Per-MESSAGE content direction, not
 * per-page. `AuraMessage` has no stored language field (its schema is
 * `{id, role, content, createdAt}` only — confirmed before writing this;
 * adding one would be a database change, out of this change's UI-only
 * scope), so direction is derived the same way conversation LANGUAGE
 * already is elsewhere in this app: from the message's own text, via the
 * EXISTING, unmodified `detectTextLanguage`.
 *
 * Deliberately applied to the INNER bubble only, never the OUTER
 * `justify-end`/`justify-start` row: which SIDE a message sits on (user
 * right, assistant left) is chat STRUCTURE, not conversational content —
 * per the "RTL changes language flow, not product
 * architecture" rule, that stays fixed by role regardless of language,
 * exactly like the AURA History/Chat panel positions. Only the TEXT
 * inside each bubble follows that message's own reading direction.
 */
function messageDir(text: string): "ltr" | "rtl" {
  return detectTextLanguage(text) === "ur" ? "rtl" : "ltr";
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isPending = message.role === "assistant" && message.content.length === 0;
  // Set only on the exact reply
  // that dispatched a real, confirmed mission (see `ActionResult.missionRef`'s
  // own doc comment). Looked up by message id, never guessed from content.
  const missionRef = useAuraChatStore((state) => state.missionRefsByMessageId[message.id]);
  const dir = messageDir(message.content);

  if (missionRef) {
    return (
      <div dir="ltr" className="flex justify-start">
        <div dir={dir} className="flex max-w-full flex-col gap-2">
          {message.content ? (
            <div className="max-w-[85%] rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 text-foreground shadow-panel">
              <MarkdownRenderer content={message.content} />
            </div>
          ) : null}
          <AuraMissionCard missionRef={missionRef} />
        </div>
      </div>
    );
  }

  return (
    <div dir="ltr" className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        dir={dir}
        className={cn(
          "max-w-[85%] rounded-xl px-3.5 py-2.5 shadow-panel",
          isUser
            ? "bg-accent text-accent-foreground"
            : "border border-border bg-surface-elevated text-foreground",
        )}
      >
        {isPending ? (
          <TypingIndicator />
        ) : isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <MarkdownRenderer content={message.content} />
        )}
      </div>
    </div>
  );
}
