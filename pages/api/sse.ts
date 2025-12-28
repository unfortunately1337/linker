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

    // Register SSE connection
    await registerSSEConnection(res, connectionId, userId, chatId as string | undefined);

    // Always subscribe to user channel for personal events (friend requests, status changes, calls)
    await subscribeConnectionToChannel(connectionId, `user-${userId}`);

    // If chatId is provided, subscribe to the chat channel
    if (chatId && typeof chatId === 'string') {
      await subscribeConnectionToChannel(connectionId, `chat-${chatId}`);
    }

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
