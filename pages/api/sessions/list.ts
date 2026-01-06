import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import prisma from '../../../lib/prisma';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const sessions = await prisma.session.findMany({
      where: { userId: session.user.id },
      orderBy: { lastActivityAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        browser: true,
        os: true,
        deviceType: true,
        ip: true,
        isCurrent: true,
        isActive: true,
        lastActivityAt: true,
        createdAt: true,
      },
    });

    return res.status(200).json({ sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
