"use client";

import type { ChatRequestBody } from "../types";

/**
 * The only thing the client knows about talking to an AI provider: POST to
 * AURA's own API route and read back either a single JSON reply or an SSE
 * stream of `{ delta }` chunks. No Gemini/OpenAI/etc-specific request or
 * response shape appears here — that all lives server-side in
 * `lib/aura/providers/*`, reached through the API route.
 */
export async function streamChatViaApi(
  body: ChatRequestBody,
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  /**
   * OPTIONAL extra request headers, purely additive (every existing caller
   * that doesn't pass this is completely unaffected). Exists so a voice
   * interaction's own correlation id (`x-voice-request-id`) can ride along
   * on the SAME request a typed message would make, without adding a body
   * field to `ChatRequestBody` (which the server's own zod schema would
   * then need to know to ignore) or duplicating this function.
   */
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const response = await fetch("/api/aura/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
    signal,
  });

  if (!body.stream) {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "AURA request failed.");
    onDelta(data.content ?? "");
    return;
  }

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error ?? "AURA request failed.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice("data:".length).trim();
      if (!payload) continue;

      const event = JSON.parse(payload) as { delta?: string; error?: string; done?: boolean };
      if (event.error) throw new Error(event.error);
      if (event.delta) onDelta(event.delta);
    }
  }
}
