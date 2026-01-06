import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { generateChannelAuth } from '@/lib/pusher';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { socket_id, channel_name } = req.body;

    if (!socket_id || !channel_name) {
      return res.status(400).json({ error: 'Missing socket_id or channel_name' });
    }

    // Validate channel access
    const userId = session.user.id;

    // Only allow access to user's own private channel or public chat channels
    if (channel_name.startsWith('private-user-')) {
      const channelUserId = channel_name.replace('private-user-', '');
      if (channelUserId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    } else if (channel_name.startsWith('chat-')) {
      // Chat channel access could be validated more strictly if needed
      // For now, allow all authenticated users
    }

    // Generate auth token
    const auth = generateChannelAuth(socket_id, channel_name);
    
    res.status(200).json(auth);
  } catch (err) {
    console.error('[PUSHER-AUTH] ❌ Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
