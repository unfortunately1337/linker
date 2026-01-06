import prisma from './prisma';
import { detectBrowserAndOS } from './detectBrowser';

export interface SessionData {
  id: string;
  userId: string;
  deviceName: string;
  ip?: string | null;
  browser?: string | null;
  os?: string | null;
  deviceType?: string | null;
  isActive: boolean;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new session for a user (or reuse existing similar one)
 */
export async function createSession(
  userId: string,
  deviceName: string,
  ip?: string | null,
  userAgent?: string | null,
  isCurrent: boolean = false
): Promise<SessionData> {
  const { browser, os, deviceType } = detectBrowserAndOS(userAgent || undefined);
  
  // Check if there's already an active session with the same browser/os/deviceType
  const existingSession = await prisma.session.findFirst({
    where: {
      userId,
      browser,
      os,
      deviceType,
      isActive: true,
    },
    orderBy: {
      lastActivityAt: 'desc',
    },
  });

  if (existingSession) {
    // Reuse existing session - just update the timestamp and set as current
    const updatedSession = await prisma.session.update({
      where: { id: existingSession.id },
      data: {
        isCurrent,
        lastActivityAt: new Date(),
      },
    });
    console.log('[SESSION] Reused existing session for user:', userId, 'Browser:', browser, 'OS:', os);
    return updatedSession as SessionData;
  }

  // Create new session if no similar one exists
  const session = await prisma.session.create({
    data: {
      userId,
      deviceName,
      ...(ip && { ip }),
      browser,
      os,
      deviceType,
      isCurrent,
      isActive: true,
    },
  });

  // Check if user has more than 10 active sessions
  const activeSessions = await prisma.session.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      createdAt: 'asc', // oldest first
    },
  });

  if (activeSessions.length > 10) {
    const sessionsToDelete = activeSessions.slice(0, activeSessions.length - 10);
    await prisma.session.updateMany({
      where: {
        id: { in: sessionsToDelete.map(s => s.id) },
      },
      data: { isActive: false },
    });
  }

  console.log('[SESSION] Created new session for user:', userId, 'Browser:', browser, 'OS:', os);
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
