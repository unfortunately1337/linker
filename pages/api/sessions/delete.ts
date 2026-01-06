import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '../../../lib/prisma';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { sessionId } = req.query;

    if (!sessionId || typeof sessionId !== 'string') {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Verify the session belongs to the user
    const sessionToDelete = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!sessionToDelete || sessionToDelete.userId !== session.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Delete the session
    await prisma.session.delete({
      where: { id: sessionId },
    });

    return res.status(200).json({ success: true, message: 'Session terminated' });
  } catch (error) {
    console.error('Error deleting session:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
