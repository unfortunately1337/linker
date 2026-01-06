import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id;
  const { targetUserId, blocked } = req.body;

  console.log('[BLOCK API] Request:', { userId, targetUserId, blocked });

  if (!targetUserId || typeof targetUserId !== 'string') {
    return res.status(400).json({ error: 'targetUserId is required' });
  }

  if (typeof blocked !== 'boolean') {
    return res.status(400).json({ error: 'blocked must be a boolean' });
  }

  try {
    if (blocked) {
      // Добавить блокировку
      await prisma.blockedUser.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: userId,
            blockedId: targetUserId
          }
        },
        update: {},
        create: {
          blockerId: userId,
          blockedId: targetUserId
        }
      });
      console.log('[BLOCK API] User blocked successfully');
    } else {
      // Удалить блокировку
      await prisma.blockedUser.deleteMany({
        where: {
          blockerId: userId,
          blockedId: targetUserId
        }
      });
      console.log('[BLOCK API] User unblocked successfully');
    }

    return res.status(200).json({ success: true, blocked });
  } catch (error) {
    console.error('Block user error:', error);
    return res.status(500).json({ error: 'Failed to block user' });
  }
}
