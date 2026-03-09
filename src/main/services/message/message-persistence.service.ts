import type { Message as PrismaMessage, Prisma, PrismaClient } from '@prisma/client'

async function touchSession(
  tx: Prisma.TransactionClient,
  sessionId: string
): Promise<void> {
  await tx.session.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() }
  })
}

export async function persistUserMessage({
  prisma,
  sessionId,
  content,
  metadata
}: {
  prisma: PrismaClient
  sessionId: string
  content: string
  metadata?: Record<string, unknown>
}): Promise<PrismaMessage> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId,
        role: 'user',
        content,
        metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined
      }
    })

    await touchSession(tx, sessionId)
    return created
  })
}

export async function persistAssistantMessage({
  prisma,
  sessionId,
  content,
  metadata
}: {
  prisma: PrismaClient
  sessionId: string
  content: string
  metadata?: Record<string, unknown>
}): Promise<PrismaMessage> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.message.create({
      data: {
        sessionId,
        role: 'assistant',
        content,
        metadata: ((metadata || {}) as Prisma.InputJsonValue) ?? undefined
      }
    })

    await touchSession(tx, sessionId)
    return created
  })
}
