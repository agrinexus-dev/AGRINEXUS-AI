"use client";

import type { AuraMessage, ProviderId } from "../types";
import type { AuraClassifiedIntent } from "./types";

/**
 * AURA Intelligence phase — the only thing the client knows about the
 * intent-classifier: POST to `/api/aura/intent` and read back a validated
 * intent or `null`. Mirrors `client/aura-api-client.ts`'s own "no
 * provider-specific shape leaks past this file" convention. Never throws —
 * a network failure or a non-OK response is treated the same as "no
 * intent," so the caller always falls through safely to ordinary
 * conversation.
 */
export async function classifyIntentViaApi(
  text: string,
  plotLabels: string[],
  recentMessages: AuraMessage[],
  provider: ProviderId,
  model: string,
): Promise<AuraClassifiedIntent | null> {
  try {
    const response = await fetch("/api/aura/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, plotLabels, recentMessages, provider, model }),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { intent: AuraClassifiedIntent | null };
    return data.intent;
  } catch {
    return null;
  }
}
