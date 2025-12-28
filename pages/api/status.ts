import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import prisma from '../../lib/prisma';
import { publishUserEvent } from '../../lib/realtime';

type Body = { status?: 'online' | 'offline' | 'dnd' } | undefined;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    try {
      console.warn('[STATUS API] Unauthorized — missing session. Request cookies/header:', { cookieHeader: req.headers.cookie || null, host: req.headers.host || null });
    } catch (e) {
      console.warn('[STATUS API] Failed to log headers for unauthorized request', e);
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body as Body;
  if (!body || !body.status) return res.status(400).json({ error: 'status required' });
  const status = body.status;
  try {
    // Update user status in DB (if column exists) otherwise skip DB update
    try {
      await prisma.user.update({ where: { id: session.user.id }, data: { status } as any });
    } catch (e) {
      // If `status` column doesn't exist, ignore DB update
    }

    // Trigger event on user-specific channel via SSE/Pusher
    try {
      await publishUserEvent(session.user.id, 'status-changed', { userId: session.user.id, status });
    } catch (e) {
      console.error('[STATUS] Error publishing status-changed:', e);
    }

    // Optionally trigger on chat channels where this user participates could be implemented later
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
 