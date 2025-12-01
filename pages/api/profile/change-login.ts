import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

import type { NextApiRequest, NextApiResponse } from 'next';
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session || !session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { newLogin } = req.body;
  if (!newLogin || typeof newLogin !== 'string' || newLogin.length === 0) {
    return res.status(400).json({ error: 'Invalid login' });
  }

  // Validate login format
  if (!/^[A-Za-z0-9_]{3,32}$/.test(newLogin)) {
    return res.status(400).json({ error: 'Invalid login format' });
  }

  try {
    // Use database unique constraint to prevent race condition (TOCTOU)
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { login: newLogin }
    });
    const returned = {
      id: user.id,
      login: user.login,
      link: user.link || null,
      avatar: user.avatar || null,
      role: user.role || null,
      description: user.description || null,
      backgroundUrl: user.backgroundUrl || null,
      createdAt: user.createdAt,
    };
    return res.status(200).json({ user: returned });
  } catch (error: any) {
    console.error('[PROFILE] Failed to change login');
    if (error.code === 'P2002') {
      // Unique constraint violation (login already taken)
      return res.status(409).json({ error: 'Login is already taken' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
}
