"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Typography,
  cn,
} from "@agrinexus/ui";

import { useAuraConversationStore } from "@/lib/aura/conversations/aura-conversation-store";
import type { AuraConversationSummary } from "@/lib/aura/conversations/types";
import { useFarmerTranslation } from "@/lib/farmer/i18n/use-farmer-translation";

/**
 * The functional AURA chat-history sidebar: "New Chat",
 * conversations grouped Today/Yesterday/Older, and "Clear History". Kept to
 * plain existing `@agrinexus/ui` primitives and the Farmer theme's own
 * neumorphic tokens (no new visual system) — functional first, per Part 18's
 * explicit "this is NOT a UI-polishing phase."
 */

type ConversationGroupId = "Today" | "Yesterday" | "Older";

// The internal grouping KEY stays English (`groups`
// object keys, never rendered) so the grouping logic itself is untouched;
// only the RENDERED label goes through translation, via `GROUP_LABEL_KEYS`
// below, at the actual JSX call site.
function groupLabel(updatedAt: number): ConversationGroupId {
  const now = new Date();
  const date = new Date(updatedAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  if (date.getTime() >= startOfToday) return "Today";
  if (date.getTime() >= startOfYesterday) return "Yesterday";
  return "Older";
}

function groupConversations(conversations: AuraConversationSummary[]): { label: ConversationGroupId; items: AuraConversationSummary[] }[] {
  const groups: Record<ConversationGroupId, AuraConversationSummary[]> = { Today: [], Yesterday: [], Older: [] };
  for (const conversation of conversations) {
    groups[groupLabel(conversation.updatedAt)]!.push(conversation);
  }
  return (["Today", "Yesterday", "Older"] as const)
    .map((label) => ({ label, items: groups[label]! }))
    .filter((group) => group.items.length > 0);
}

const GROUP_LABEL_KEYS: Record<ConversationGroupId, "aura.groupToday" | "aura.groupYesterday" | "aura.groupOlder"> = {
  Today: "aura.groupToday",
  Yesterday: "aura.groupYesterday",
  Older: "aura.groupOlder",
};

export interface AuraHistoryPanelProps {
  /** Merged onto this panel's own root classes via `cn` (tailwind-merge), so a caller can override sizing/visibility (e.g. `"hidden lg:flex"` for the permanent desktop rail, `"w-full border-e-0 pe-0"` for the mobile drawer's own full-width content) without this component needing to know which context it's in. `undefined` (the desktop call site, pre-existing) renders exactly as before. */
  className?: string;
  /** Fired right after a conversation is opened. The desktop rail leaves this `undefined` (nothing to close). The mobile drawer passes its own `() => setOpen(false)` so picking a conversation closes the drawer — the ONLY behavioral difference between the two render sites; the conversation logic itself (open/delete/clear, from `useAuraConversationStore`) is never duplicated, just this one extra, optional side effect. */
  onSelectConversation?: () => void;
}

export function AuraHistoryPanel({ className, onSelectConversation }: AuraHistoryPanelProps = {}) {
  const { t, dir } = useFarmerTranslation();
  const conversations = useAuraConversationStore((state) => state.conversations);
  const activeConversationId = useAuraConversationStore((state) => state.activeConversationId);
  const startNewChat = useAuraConversationStore((state) => state.startNewChat);
  const openConversation = useAuraConversationStore((state) => state.openConversation);
  const deleteConversation = useAuraConversationStore((state) => state.deleteConversation);
  const clearAllHistory = useAuraConversationStore((state) => state.clearAllHistory);

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const groups = groupConversations(conversations);

  return (
    // This OUTER wrapper deliberately does NOT reassert `dir`:
    // `border-e`/`pe-3` here are STRUCTURAL (the separator between History
    // and Chat, and the scroll gutter's own spacing) — they must stay
    // resolved against the WORKSPACE's now-fixed `dir="ltr"` (set by the
    // parent row in `farmer-aura-page.tsx`) so the separator always lands
    // on this panel's right edge, adjacent to Chat, regardless of
    // language. `dir={dir}` (the Farmer's actual App Language direction)
    // is applied on the INNER wrapper below instead, so ONLY this panel's
    // TEXT content (title, buttons, conversation list) gets Urdu's natural
    // reading direction — the two concerns (structural border position vs.
    // text direction) are intentionally split across two elements rather
    // than fighting over one `dir` value.
    <div className={cn("flex h-full min-h-0 w-64 shrink-0 flex-col gap-3 border-e border-border-subtle pe-3", className)}>
      <div dir={dir} className="flex h-full min-h-0 flex-1 flex-col gap-3">
        <Typography variant="small" className="px-1 font-semibold tracking-wide text-foreground-subtle uppercase">
          {t("aura.historyTitle")}
        </Typography>

        <Button
          intent="outline"
          className="justify-start gap-2"
          onClick={() => {
            startNewChat();
            onSelectConversation?.();
          }}
        >
          <Plus className="size-4" aria-hidden />
          {t("aura.newChat")}
        </Button>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pe-1">
          {groups.length === 0 && (
            <Typography variant="small" className="px-1 text-foreground-subtle">
              {t("aura.noConversationsYet")}
            </Typography>
          )}
          {groups.map((group) => (
            <div key={group.label} className="space-y-1">
              <Typography variant="small" className="px-1 text-foreground-subtle">
                {t(GROUP_LABEL_KEYS[group.label])}
              </Typography>
              {group.items.map((conversation) => (
                <div
                  key={conversation.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-xl px-2 py-2 text-sm transition-colors",
                    conversation.id === activeConversationId ? "text-accent" : "text-foreground-muted hover:text-foreground",
                  )}
                  style={{ boxShadow: conversation.id === activeConversationId ? "var(--shadow-neu-inset)" : undefined }}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-start"
                    onClick={() => {
                      void openConversation(conversation.id);
                      onSelectConversation?.();
                    }}
                    title={conversation.title}
                  >
                    {conversation.title}
                  </button>
                  <IconButton
                    aria-label={`${t("aura.deleteConversationLabel")} "${conversation.title}"`}
                    icon={<Trash2 className="size-3.5" />}
                    intent="ghost"
                    size="sm"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteConversation(conversation.id);
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>

        <Button
          intent="ghost"
          className="justify-start text-critical hover:text-critical"
          disabled={conversations.length === 0}
          onClick={() => setConfirmClearOpen(true)}
        >
          {t("aura.clearHistory")}
        </Button>
      </div>

      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("aura.deleteAllTitle")}</DialogTitle>
            <DialogDescription>{t("aura.deleteAllDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button intent="outline" onClick={() => setConfirmClearOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              intent="destructive"
              onClick={() => {
                void clearAllHistory();
                setConfirmClearOpen(false);
              }}
            >
              {t("aura.deleteAll")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
