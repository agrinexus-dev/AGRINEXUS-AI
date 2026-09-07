import "server-only";

import type { ProviderId, ProviderMeta } from "../types";
import { claudeProvider } from "./claude-provider";
import { geminiProvider } from "./gemini-provider";
import { groqProvider } from "./groq-provider";
import { ollamaProvider } from "./ollama-provider";
import { openaiProvider } from "./openai-provider";
import { openrouterProvider } from "./openrouter-provider";
import type { AIProvider } from "./provider";

/**
 * The one place that knows every concrete provider. AURA Core (the API
 * routes) only ever calls `getProvider`/`listProviderMeta` — never imports a
 * `*-provider.ts` module directly, so adding a real OpenAI/Claude/Ollama
 * implementation later means touching that provider's file and this
 * registry, nothing that calls into the registry.
 */
const PROVIDERS: Record<ProviderId, AIProvider> = {
  gemini: geminiProvider,
  openrouter: openrouterProvider,
  groq: groqProvider,
  openai: openaiProvider,
  claude: claudeProvider,
  ollama: ollamaProvider,
};

export function getProvider(id: ProviderId): AIProvider {
  return PROVIDERS[id];
}

export function listProviderMeta(): ProviderMeta[] {
  return Object.values(PROVIDERS).map((provider) => provider.meta);
}
