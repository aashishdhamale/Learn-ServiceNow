import 'server-only';
import { getPrisma, Prisma, type User } from '@snow-mastery/db';
import { connection } from 'next/server';
import { cache } from 'react';
import { serverEnv } from './env';

/**
 * Phase 1 has a single local learner and no login. Everything that needs "the learner"
 * goes through here, so real authentication can replace this one function later.
 * Cached per request: layouts and pages call it concurrently.
 */
export const getCurrentUser = cache(async (): Promise<User> => {
  await connection(); // per-request data: never prerender pages that call this
  const email = serverEnv().LOCAL_LEARNER_EMAIL;
  const prisma = getPrisma();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  try {
    return await prisma.user.create({ data: { email, displayName: 'Learner' } });
  } catch (error) {
    // Another request created it first.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.user.findUniqueOrThrow({ where: { email } });
    }
    throw error;
  }
});
