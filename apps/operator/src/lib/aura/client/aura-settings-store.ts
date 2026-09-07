"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { ProviderId } from "../types";

interface AuraSettingsState {
  provider: ProviderId;
  model: string;
  temperature: number;
  streamingEnabled: boolean;
  setProvider: (provider: ProviderId, defaultModel: string) => void;
  setModel: (model: string) => void;
  setTemperature: (temperature: number) => void;
  setStreamingEnabled: (enabled: boolean) => void;
}

export const useAuraSettingsStore = create<AuraSettingsState>()(
  persist(
    (set) => ({
      // Default is now Groq, matching this change's
      // explicit provider-priority order ("1. Groq 2. OpenRouter 3. other").
      // Both Groq and OpenRouter are live-confirmed working providers (see
      // groq-provider.ts/openrouter-provider.ts); Groq leads because the
      // generalized fallback router (`chat-router.ts`) now tries providers
      // in EXACTLY this priority order whenever the requested one fails, so
      // the visible default and the automatic-fallback order agree. A user
      // with an already-persisted `provider`/`model` in localStorage from an
      // earlier phase is unaffected by this default change — both remain
      // fully selectable either way, same precedent an earlier default
      // change already established here.
      provider: "groq",
      model: "openai/gpt-oss-20b",
      temperature: 0.7,
      streamingEnabled: true,
      setProvider: (provider, defaultModel) => set({ provider, model: defaultModel }),
      setModel: (model) => set({ model }),
      setTemperature: (temperature) => set({ temperature }),
      setStreamingEnabled: (streamingEnabled) => set({ streamingEnabled }),
    }),
    { name: "aura-settings" },
  ),
);
