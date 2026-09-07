"use client";

import { useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";

import type { AuraMessage } from "@/lib/aura/types";

import { MessageBubble } from "./message-bubble";

export interface MessageListProps {
  messages: AuraMessage[];
  /**
   * Optional overrides for
   * the empty-state copy, defaulting to the exact existing English strings.
   * Additive-only: the Operator floating panel (`aura-panel.tsx`) never
   * passes these and renders byte-identically to before this change;
   * only `FarmerAuraPage` supplies Urdu strings, and only when the Farmer's
   * `displayLanguage` is Urdu. Kept as plain string props (not a `t`
   * function or a shared translation-key type) so this shared component
   * stays fully decoupled from the Farmer-only i18n system — it doesn't
   * even know one exists.
   */
  emptyStateTitle?: string;
  emptyStateDescription?: string;
}

export function MessageList({
  messages,
  emptyStateTitle = "Ask AURA anything",
  emptyStateDescription = "Your AI operating assistant for AgriNexus — ask about the farm, the Digital Twin, or the platform.",
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-11 items-center justify-center rounded-full bg-accent-muted text-accent">
          <Sparkles className="size-5" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{emptyStateTitle}</p>
          <p className="text-xs text-foreground-subtle">{emptyStateDescription}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={endRef} />
    </div>
  );
}
