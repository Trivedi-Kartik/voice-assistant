import { db } from "../db.js";

// Durable record of a conversation thread (Phase 2 — see prisma/schema.prisma
// for why this now exists alongside the v1 ephemeral Redis working buffer).
export async function createConversation(id: string, userId: string, deviceId: string): Promise<void> {
  await db.conversation.create({ data: { id, userId, deviceId } });
}

export interface AppendMessageOptions {
  toolName?: string;
  toolCallId?: string;
}

// Returns the new message's id — used as memory_facts.source_message_id when a
// fact gets remembered from this specific message (see memoryStore.ts).
export async function appendMessage(
  conversationId: string,
  role: string,
  content: string,
  options?: AppendMessageOptions
): Promise<string> {
  const message = await db.message.create({
    data: {
      conversationId,
      role,
      content,
      toolName: options?.toolName,
      toolCallId: options?.toolCallId,
    },
  });
  await db.conversation.update({ where: { id: conversationId }, data: { lastActiveAt: new Date() } });
  return message.id;
}
