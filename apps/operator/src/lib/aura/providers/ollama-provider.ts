import "server-only";

import type { ProviderConnectionStatus } from "../types";
import type { AIProvider, ChatOptions } from "./provider";
import { ProviderNotImplementedError } from "./provider";
import { OLLAMA_META } from "./provider-meta";

/** Stub — interface-complete, no real implementation this change. */
class OllamaProvider implements AIProvider {
  readonly id = "ollama" as const;
  readonly meta = OLLAMA_META;

  async getStatus(): Promise<ProviderConnectionStatus> {
    return "coming-soon";
  }

  async chat(_options: ChatOptions): Promise<string> {
    throw new ProviderNotImplementedError(this.id);
  }

  async *streamChat(_options: ChatOptions): AsyncGenerator<string, void, unknown> {
    throw new ProviderNotImplementedError(this.id);
  }
}

export const ollamaProvider = new OllamaProvider();
