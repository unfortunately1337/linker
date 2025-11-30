import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { endSession } from '../../lib/sessions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { userId, sessionId } = req.body;
  if (!userId || !sessionId) return res.status(400).json({ error: "userId and sessionId required" });

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session || !session.user || !(session.user as any).id) return res.status(401).json({ error: 'Unauthorized' });
  const currentUserId = (session.user as any).id;

  // Only allow ending sessions for yourself
  if (String(currentUserId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

  // End the session in PostgreSQL
  await endSession(sessionId);
  return res.status(200).json({ ok: true });
}
