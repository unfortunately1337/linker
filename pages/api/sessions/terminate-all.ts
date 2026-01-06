import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { deactivateAllUserSessions } from '../../../lib/sessions';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;

    // Mark all sessions as inactive
    const result = await prisma.session.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    console.log('[SESSIONS] All sessions terminated for user:', userId, 'Count:', result.count);

    return res.status(200).json({ 
      success: true, 
      message: 'All sessions terminated',
      count: result.count 
    });
  } catch (error) {
    console.error('[SESSIONS] Error terminating all sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
