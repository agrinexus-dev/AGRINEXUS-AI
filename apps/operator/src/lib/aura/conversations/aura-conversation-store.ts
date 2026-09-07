"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { AuraMessage } from "../types";
import { usePendingActionStore } from "../actions/pending-action-store";
import { useAuraChatStore } from "../client/aura-chat-store";
import type { AuraConversationSummary } from "./types";

/**
 * Persistent AURA conversation history for the
 * Farmer AURA page. Deliberately layered ON TOP of `aura-chat-store.ts`
 * (untouched apart from the small additive `loadMessages` action) rather
 * than rewritten into it — `aura-chat-store.ts` is also Operator's floating
 * panel, which this change must not regress, so persistence lives
 * entirely in this NEW store instead of being forced into the shared one.
 *
 * A conversation row is created lazily, on the FIRST real message sent
 * (`sendAndPersist`) — never eagerly on "New Chat" — so refreshing before
 * typing anything never leaves an empty, meaningless conversation behind
 * ("Do not duplicate conversations unnecessarily").
 *
 * Only `activeConversationId` is persisted to localStorage (Part with
 * "Refresh the page without losing the conversation") — a per-browser
 * convenience pointing at the real, server-stored conversation; the actual
 * messages are always re-fetched from the database on load, never cached
 * client-side across sessions.
 */

interface AuraConversationState {
  conversations: AuraConversationSummary[];
  activeConversationId: string | null;
  isLoadingList: boolean;
  isLoadingConversation: boolean;
  hasHydratedActiveConversation: boolean;

  fetchConversations: () => Promise<void>;
  /** Restores the previously-active conversation's real messages after a page refresh — a no-op if none was active or it no longer exists. Safe to call more than once; only does real work the first time. */
  restoreActiveConversation: () => Promise<void>;
  /** "New Chat" (Part 6) — clears the visible transcript and un-sets the active conversation; the next message sent creates a fresh row. */
  startNewChat: () => void;
  /** "Open Chat" (Part 7) — loads a previous conversation's real messages from the database in chronological order. */
  openConversation: (id: string) => Promise<void>;
  /** Delete ONE conversation (Part 8) — never touches farm/finding/mission/alert data. */
  deleteConversation: (id: string) => Promise<void>;
  /** Clear ALL of this Farmer's conversations (Part 9) — the confirmation dialog lives in the UI component; by the time this is called, the Farmer has already confirmed. */
  clearAllHistory: () => Promise<void>;
  /** Persists the Farmer's own message — creates a new conversation (with a generated title) if none is active yet, otherwise appends to the active one. Called right before `useAuraChatStore.sendMessage`. */
  persistUserTurn: (content: string) => Promise<void>;
  /** Persists AURA's reply into the now-guaranteed-to-exist active conversation. Called right after `useAuraChatStore.sendMessage` resolves. Silently does nothing if no conversation is active (defensive — should not happen given `persistUserTurn` always runs first). */
  persistAssistantTurn: (content: string) => Promise<void>;
}

async function fetchJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error ?? `Request to ${input} failed.`);
  return data as T;
}

/**
 * AURA Mission Control Verification phase fix — an in-session-
 * only cache of each conversation's exact client-side message objects
 * (same ids `missionRefsByMessageId` was tagged with), keyed by
 * conversation id. NOT a second persistence layer or a second history
 * store (Security rules 35/36) — `/api/aura/conversations/:id` remains the
 * sole source of truth for a conversation's content; this only avoids
 * needlessly re-fetching (and re-generating fresh ids for) a conversation
 * the farmer is merely switching back to within the same browser session.
 *
 * Before this fix, `openConversation` unconditionally re-fetched from the
 * database on every click — even for a conversation that was already fully
 * loaded in memory a moment ago — and the database's own message rows carry
 * Prisma's own `cuid()` ids, never the client's original `crypto.randomUUID()`
 * ids. A mission card is looked up by exactly that original id (see
 * `message-bubble.tsx`), so it silently reverted to plain text the instant
 * the farmer switched to another conversation and back, even within the
 * very same session (live-verified while investigating this change's own
 * "cards after conversation switching" test). Cleared for a given id in
 * `deleteConversation`/`clearAllHistory` so a deleted conversation's stale
 * snapshot can never resurface. Never consulted across an actual page
 * reload — `restoreActiveConversation` always re-fetches then, unchanged.
 */
const conversationMessageCache = new Map<string, AuraMessage[]>();

export const useAuraConversationStore = create<AuraConversationState>()(
  persist(
    (set, get) => ({
      conversations: [],
      activeConversationId: null,
      isLoadingList: false,
      isLoadingConversation: false,
      hasHydratedActiveConversation: false,

      fetchConversations: async () => {
        set({ isLoadingList: true });
        try {
          const data = await fetchJson<{ conversations: AuraConversationSummary[] }>("/api/aura/conversations");
          set({ conversations: data.conversations });
        } catch {
          // Best-effort — the history sidebar simply stays empty/stale; the
          // active chat itself (already in `useAuraChatStore`) is unaffected.
        } finally {
          set({ isLoadingList: false });
        }
      },

      restoreActiveConversation: async () => {
        if (get().hasHydratedActiveConversation) return;
        set({ hasHydratedActiveConversation: true });
        const id = get().activeConversationId;
        if (!id) return;
        await get().openConversation(id);
      },

      startNewChat: () => {
        // Snapshot whatever conversation is being left behind
        // (if any) into the in-session cache first, same as `openConversation`
        // below, so switching back to it later (without an intervening page
        // reload) still shows its real mission cards instead of plain text.
        const leavingId = get().activeConversationId;
        if (leavingId) conversationMessageCache.set(leavingId, useAuraChatStore.getState().messages);

        useAuraChatStore.getState().clearConversation();
        // AURA Natural-Language-Actions phase, Part 8 — a proposal from the
        // conversation being left behind must never carry into a fresh
        // topic: `usePendingActionStore` is a single global slot, not
        // scoped per-conversation, so without this a later bare "yes" in
        // the NEW chat could confirm an old, unrelated proposal the Farmer
        // never actually replied to.
        usePendingActionStore.getState().clear();
        set({ activeConversationId: null });
      },

      openConversation: async (id) => {
        // Snapshot the conversation being left behind (if any
        // and if different from the one we're switching TO) before doing
        // anything else, mirroring `startNewChat` above.
        const leavingId = get().activeConversationId;
        if (leavingId && leavingId !== id) conversationMessageCache.set(leavingId, useAuraChatStore.getState().messages);

        const cached = conversationMessageCache.get(id);
        if (cached) {
          useAuraChatStore.getState().loadMessages(cached);
          usePendingActionStore.getState().clear();
          set({ activeConversationId: id });
          return;
        }

        set({ isLoadingConversation: true });
        try {
          const data = await fetchJson<{ conversation: { id: string; messages: { id: string; role: "user" | "assistant"; content: string; createdAt: number }[] } }>(
            `/api/aura/conversations/${id}`,
          );
          const messages: AuraMessage[] = data.conversation.messages.map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
            createdAt: message.createdAt,
          }));
          useAuraChatStore.getState().loadMessages(messages);
          conversationMessageCache.set(id, messages);
          usePendingActionStore.getState().clear();
          set({ activeConversationId: id });
        } catch {
          // The conversation may have been deleted (e.g. in another tab) —
          // fall back to a fresh chat rather than showing a broken one.
          useAuraChatStore.getState().clearConversation();
          usePendingActionStore.getState().clear();
          set({ activeConversationId: null });
        } finally {
          set({ isLoadingConversation: false });
        }
      },

      deleteConversation: async (id) => {
        try {
          await fetchJson(`/api/aura/conversations/${id}`, { method: "DELETE" });
        } catch {
          return;
        }
        conversationMessageCache.delete(id); // Phase 9.1 — a deleted conversation's snapshot must never resurface.
        set((state) => ({ conversations: state.conversations.filter((conversation) => conversation.id !== id) }));
        if (get().activeConversationId === id) {
          get().startNewChat();
        }
      },

      clearAllHistory: async () => {
        try {
          await fetchJson("/api/aura/conversations", { method: "DELETE" });
        } catch {
          return;
        }
        conversationMessageCache.clear(); // Phase 9.1 — same reasoning as `deleteConversation` above, for all of them at once.
        set({ conversations: [] });
        get().startNewChat();
      },

      persistUserTurn: async (content) => {
        const activeId = get().activeConversationId;
        try {
          if (!activeId) {
            const data = await fetchJson<{ conversation: AuraConversationSummary }>("/api/aura/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content }),
            });
            set((state) => ({
              activeConversationId: data.conversation.id,
              conversations: [data.conversation, ...state.conversations],
            }));
          } else {
            await fetchJson(`/api/aura/conversations/${activeId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: "user", content }),
            });
            set((state) => ({
              conversations: state.conversations.map((conversation) =>
                conversation.id === activeId ? { ...conversation, updatedAt: Date.now() } : conversation,
              ),
            }));
          }
        } catch {
          // Best-effort persistence (Part matches the pre-existing
          // fire-and-forget convention `persistCreate`/`persistPatch` already
          // establish elsewhere in this app — see mission stores): the live
          // conversation in `useAuraChatStore` is correct regardless, so a
          // transient network failure here never breaks the chat itself,
          // only means this turn might not survive a refresh.
        }
      },

      persistAssistantTurn: async (content) => {
        const activeId = get().activeConversationId;
        if (!activeId) return;
        try {
          await fetchJson(`/api/aura/conversations/${activeId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: "assistant", content }),
          });
          set((state) => ({
            conversations: state.conversations.map((conversation) =>
              conversation.id === activeId ? { ...conversation, updatedAt: Date.now() } : conversation,
            ),
          }));
        } catch {
          // Same best-effort reasoning as `persistUserTurn`.
        }
      },
    }),
    {
      name: "aura-active-conversation",
      partialize: (state) => ({ activeConversationId: state.activeConversationId }),
    },
  ),
);
