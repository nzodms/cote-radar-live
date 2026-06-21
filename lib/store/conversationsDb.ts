import { Prisma } from "@prisma/client";
import type { Conversation as DbConversation, Message as DbMessage } from "@prisma/client";
import type {
  Conversation,
  ConversationStatus,
  Message,
  MessageAttachment,
  SenderType,
  SupplierQuote,
} from "@/types";
import { getPrisma } from "@/lib/db/prisma";

const json = (v: unknown) => (v == null ? undefined : (v as unknown as Prisma.InputJsonValue));

type DbConversationWithMessages = DbConversation & { messages: DbMessage[] };

function toMessage(row: DbMessage): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    senderType: row.senderType as SenderType,
    content: row.content,
    timestamp: row.timestamp.toISOString(),
    channel: (row.channel as "whatsapp" | "internal") ?? "whatsapp",
    status: (row.status as Message["status"]) ?? undefined,
    attachments: (row.attachments as unknown as MessageAttachment[]) ?? undefined,
    quote: (row.quoteSnapshot as unknown as SupplierQuote) ?? undefined,
  };
}

function toConversation(row: DbConversationWithMessages): Conversation {
  return {
    id: row.id,
    supplierId: row.supplierId,
    orderId: row.orderId,
    unreadCount: row.unreadCount,
    status: row.status as ConversationStatus,
    lastMessageAt: row.lastMessageAt.toISOString(),
    messages: row.messages.map(toMessage),
  };
}

export async function getAllConversations(): Promise<Conversation[]> {
  const prisma = getPrisma();
  if (!prisma) return [];
  const rows = await prisma.conversation.findMany({
    orderBy: { lastMessageAt: "desc" },
    include: { messages: { orderBy: { timestamp: "asc" } } },
  });
  return rows.map((r) => toConversation(r as DbConversationWithMessages));
}

export async function syncConversations(conversations: Conversation[]): Promise<void> {
  const prisma = getPrisma();
  if (!prisma) return;
  const keep = conversations.map((c) => c.id);

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  // Remove conversations no longer present (cascade removes their messages).
  ops.push(
    keep.length
      ? prisma.conversation.deleteMany({ where: { id: { notIn: keep } } })
      : prisma.conversation.deleteMany({}),
  );

  for (const c of conversations) {
    ops.push(
      prisma.conversation.upsert({
        where: { id: c.id },
        create: {
          id: c.id,
          orderId: c.orderId,
          supplierId: c.supplierId,
          unreadCount: c.unreadCount,
          status: c.status,
          lastMessageAt: new Date(c.lastMessageAt),
        },
        update: {
          unreadCount: c.unreadCount,
          status: c.status,
          lastMessageAt: new Date(c.lastMessageAt),
        },
      }),
    );

    const msgKeep = c.messages.map((m) => m.id);
    ops.push(
      msgKeep.length
        ? prisma.message.deleteMany({ where: { conversationId: c.id, id: { notIn: msgKeep } } })
        : prisma.message.deleteMany({ where: { conversationId: c.id } }),
    );

    for (const m of c.messages) {
      ops.push(
        prisma.message.upsert({
          where: { id: m.id },
          create: {
            id: m.id,
            conversationId: c.id,
            senderType: m.senderType,
            content: m.content,
            channel: m.channel,
            status: m.status ?? null,
            attachments: json(m.attachments),
            quoteSnapshot: json(m.quote),
            timestamp: new Date(m.timestamp),
          },
          update: {
            content: m.content,
            status: m.status ?? null,
            attachments: json(m.attachments),
            quoteSnapshot: json(m.quote),
          },
        }),
      );
    }
  }

  await prisma.$transaction(ops);
}
