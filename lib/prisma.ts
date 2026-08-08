import "dotenv/config";
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const connectionString = `${process.env.DATABASE_URL}`

const adapter = new PrismaPg({
  connectionString,
  max: 20,
  idleTimeoutMillis: 20_000,
  connectionTimeoutMillis: 10_000,
})

const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
})

export { prisma }

