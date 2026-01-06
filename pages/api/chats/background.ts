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
  const { chatId, backgroundUrl } = req.body;

  if (!chatId || typeof chatId !== 'string') {
    return res.status(400).json({ error: 'chatId is required' });
  }

  if (backgroundUrl && typeof backgroundUrl !== 'string') {
    return res.status(400).json({ error: 'backgroundUrl must be a string' });
  }

  try {
    // Verify user is a participant of the chat
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        users: { some: { id: userId } }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Update chat background
    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: { backgroundUrl: backgroundUrl || null }
    });

    return res.status(200).json({ success: true, chat: updated });
  } catch (error) {
    console.error('Background update error:', error);
    return res.status(500).json({ error: 'Failed to update background' });
  }
}
