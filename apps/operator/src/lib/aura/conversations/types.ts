/**
 * Shared AURA conversation-history types — imported by both server (service,
 * API routes) and client (the Farmer conversation store/UI) code, so this
 * module must stay free of any server-only or client-only imports, mirroring
 * `lib/aura/types.ts`'s own rule.
 */

export type AuraConversationRole = "user" | "assistant";

export interface AuraConversationMessage {
  id: string;
  role: AuraConversationRole;
  content: string;
  createdAt: number;
}

/** The list-view shape (Part 5's history sidebar) — no message bodies, just enough to render "Today / Yesterday / Older" groups. */
export interface AuraConversationSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface AuraConversationDetail extends AuraConversationSummary {
  messages: AuraConversationMessage[];
}
