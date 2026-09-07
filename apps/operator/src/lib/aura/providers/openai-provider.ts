import "server-only";

import type { ProviderConnectionStatus } from "../types";
import type { AIProvider, ChatOptions } from "./provider";
import { ProviderNotImplementedError } from "./provider";
import { OPENAI_META } from "./provider-meta";

/** Stub — interface-complete, no real implementation this change. */
class OpenAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly meta = OPENAI_META;

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

export const openaiProvider = new OpenAIProvider();
