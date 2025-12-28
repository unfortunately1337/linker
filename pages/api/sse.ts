import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { registerSSEConnection, unregisterSSEConnection, subscribeConnectionToChannel } from '@/lib/sse';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests for SSE stream
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = session.user.id;
    const { chatId } = req.query;

    // Generate unique connection ID
    const connectionId = `${userId}-${uuidv4()}`;

    // Register SSE connection (this automatically subscribes to user and chat channels)
    await registerSSEConnection(res, connectionId, userId, chatId as string | undefined);

    console.log(`[SSE] New connection: ${connectionId} for user ${userId}${chatId ? ` chat ${chatId}` : ''}`);

    // Keep the response open indefinitely
    res.on('close', () => {
      unregisterSSEConnection(connectionId);
    });
  } catch (err) {
    console.error('[SSE] Connection error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
