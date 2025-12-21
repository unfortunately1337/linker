import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSocket } from '../../../lib/socket';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId required' });
  // Отправить событие "typing" через Pusher
  const pusher = getSocket();
  if (pusher) {
    await pusher.trigger(`chat-${chatId}`, 'typing', {
      userId: session.user.id,
      name: session.user.name || '',
    });
  }
  return res.status(200).json({ ok: true });
}
