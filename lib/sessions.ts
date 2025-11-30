import prisma from './prisma';

export interface SessionData {
  id: string;
  userId: string;
  deviceName: string;
  ip?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new session for a user
 */
export async function createSession(
  userId: string,
  deviceName: string,
  ip?: string | null
): Promise<SessionData> {
  const session = await prisma.session.create({
    data: {
      userId,
      deviceName,
      ...(ip && { ip }),
      isActive: true,
    },
  });
  return session as SessionData;
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });
  return sessions as SessionData[];
}

/**
 * Get a session by ID
 */
export async function getSessionById(sessionId: string): Promise<SessionData | null> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
  });
  return (session || null) as SessionData | null;
}

/**
 * Deactivate a specific session
 */
export async function endSession(sessionId: string): Promise<SessionData> {
  const session = await prisma.session.update({
    where: { id: sessionId },
    data: { isActive: false },
  });
  return session as SessionData;
}

/**
 * Deactivate all sessions for a user except the current one
 */
export async function deactivateOtherSessions(
  userId: string,
  excludeSessionId: string
): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      id: { not: excludeSessionId },
      isActive: true,
    },
    data: { isActive: false },
  });
  return result.count;
}

/**
 * Deactivate all sessions for a user
 */
export async function deactivateAllUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: {
      userId,
      isActive: true,
    },
    data: { isActive: false },
  });
  return result.count;
}

/**
 * Delete expired sessions (older than 30 days)
 */
export async function cleanupOldSessions(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.session.deleteMany({
    where: {
      createdAt: { lt: thirtyDaysAgo },
    },
  });
  return result.count;
}
