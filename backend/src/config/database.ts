import { PrismaClient } from '@prisma/client'

let prisma: PrismaClient | undefined

export function getPrismaClient(): PrismaClient {
  prisma ??= new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })
  return prisma
}

export async function connectDatabase(): Promise<void> {
  await getPrismaClient().$connect()
}

export async function disconnectDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect()
    prisma = undefined
  }
}
