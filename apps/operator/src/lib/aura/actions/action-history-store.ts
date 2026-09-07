"use client";

import { create } from "zustand";

/** In-session-only action history — cleared on reload, never persisted. */
export interface ActionHistoryEntry {
  label: string;
  success: boolean;
  timestamp: number;
}

interface ActionHistoryState {
  entries: ActionHistoryEntry[];
  record: (entry: ActionHistoryEntry) => void;
  getLast: () => ActionHistoryEntry | null;
}

const MAX_HISTORY_ENTRIES = 20;

export const useActionHistoryStore = create<ActionHistoryState>((set, get) => ({
  entries: [],
  record: (entry) =>
    set((state) => ({ entries: [...state.entries, entry].slice(-MAX_HISTORY_ENTRIES) })),
  getLast: () => {
    const { entries } = get();
    return entries.length > 0 ? entries[entries.length - 1]! : null;
  },
}));
