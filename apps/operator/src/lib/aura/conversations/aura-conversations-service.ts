import "server-only";

import { prisma } from "@/lib/prisma/client";

import { generateConversationTitle } from "./title-generator";
import type { AuraConversationDetail, AuraConversationMessage, AuraConversationRole, AuraConversationSummary } from "./types";

/**
 * Server-only AURA conversation-history data access.
 * Mirrors `findings-service.ts`/`alerts-service.ts`'s exact conventions:
 * every function takes `userId`/`farmId` explicitly, every caller derives
 * both from the authenticated session (never from client input
 * Part 28 #7/8/9/10), and every query filters by BOTH so a farmer can never
 * see another farmer's conversations even on the same farm (see
 * `AuraConversation`'s own schema doc comment).
 */

const LIST_LIMIT = 200;

function toSummary(row: { id: string; title: string; createdAt: Date; updatedAt: Date }): AuraConversationSummary {
  return { id: row.id, title: row.title, createdAt: row.createdAt.getTime(), updatedAt: row.updatedAt.getTime() };
}

export async function listConversations(userId: string, farmId: string): Promise<AuraConversationSummary[]> {
  const rows = await prisma.auraConversation.findMany({
    where: { userId, farmId },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return rows.map(toSummary);
}

/** Returns `null` (never throws) if the conversation doesn't exist OR doesn't belong to this exact user+farm — the route answers 404 either way, never distinguishing "doesn't exist" from "not yours" (same non-leaking pattern every other service uses for cross-tenant lookups). */
export async function getConversation(userId: string, farmId: string, conversationId: string): Promise<AuraConversationDetail | null> {
  const row = await prisma.auraConversation.findFirst({
    where: { id: conversationId, userId, farmId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!row) return null;

  const messages: AuraConversationMessage[] = row.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.getTime(),
  }));

  return { ...toSummary(row), messages };
}

/**
 * Creates a new conversation AND its first message in one call (Part 6:
 * "Create a new conversation... Do not duplicate conversations
 * unnecessarily" — a conversation is only ever created alongside a real
 * first message, never as an empty placeholder row a Farmer might abandon
 * and never send anything into). Title generation is best-effort
 * and never blocks/fails this — see `title-generator.ts`.
 */
export async function createConversation(
  userId: string,
  farmId: string,
  firstMessageRole: AuraConversationRole,
  firstMessageContent: string,
): Promise<AuraConversationDetail> {
  const title = await generateConversationTitle(firstMessageContent);

  const row = await prisma.auraConversation.create({
    data: {
      userId,
      farmId,
      title,
      messages: { create: [{ role: firstMessageRole, content: firstMessageContent }] },
    },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  const messages: AuraConversationMessage[] = row.messages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    createdAt: message.createdAt.getTime(),
  }));

  return { ...toSummary(row), messages };
}

/** Returns `null` (never throws) if the conversation isn't this user+farm's — same cross-tenant-safe pattern as `getConversation`. Bumps the conversation's `updatedAt` (via the implicit relation write) so it re-sorts to the top of the history list, matching "most recently active first." */
export async function appendMessage(
  userId: string,
  farmId: string,
  conversationId: string,
  role: AuraConversationRole,
  content: string,
): Promise<AuraConversationMessage | null> {
  const owned = await prisma.auraConversation.findFirst({ where: { id: conversationId, userId, farmId }, select: { id: true } });
  if (!owned) return null;

  const message = await prisma.auraMessage.create({ data: { conversationId, role, content } });
  await prisma.auraConversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });

  return { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.getTime() };
}

/**
 * Part 8 — deletes ONLY this conversation and its messages (cascade via the
 * schema's `onDelete: Cascade` on `AuraMessage.conversationId`). Never
 * touches Farm/Plot/Finding/Mission/Alert — no relation exists between those
 * models and this one. Returns `false` (never throws) if the conversation
 * isn't this user+farm's, so the route can answer 404.
 */
export async function deleteConversation(userId: string, farmId: string, conversationId: string): Promise<boolean> {
  const result = await prisma.auraConversation.deleteMany({ where: { id: conversationId, userId, farmId } });
  return result.count > 0;
}

/** Part 9 — clears ALL of this user's conversations on this farm, and only this user's. Never touches another user's conversations, another farm's data, or any operational table. */
export async function clearAllConversations(userId: string, farmId: string): Promise<number> {
  const result = await prisma.auraConversation.deleteMany({ where: { userId, farmId } });
  return result.count;
}
