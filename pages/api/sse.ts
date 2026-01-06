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
    console.log('[SSE-ENDPOINT] GET /api/sse');
    
    // Authenticate user
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?.id) {
      console.warn('[SSE-ENDPOINT] ❌ Unauthorized: no session or user id');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    console.log('[SSE-ENDPOINT] ✅ Authenticated:', session.user.id);

    const userId = session.user.id;
    let chatId = req.query.chatId;
    
    // Ensure chatId is a string or undefined (not an array)
    if (Array.isArray(chatId)) {
      chatId = chatId[0];
    }
    
    console.log('[SSE-ENDPOINT] Parameters: userId=' + userId + ', chatId=' + (chatId || 'none'));

    // Generate unique connection ID
    const connectionId = `${userId}-${uuidv4()}`;
    console.log('[SSE-ENDPOINT] Generated connectionId:', connectionId);

    // Register SSE connection (this automatically subscribes to user and chat channels)
    console.log('[SSE-ENDPOINT] Calling registerSSEConnection...');
    await registerSSEConnection(res, connectionId, userId, chatId as string | undefined);

    console.log(`[SSE-ENDPOINT] ✅ Connection registered: ${connectionId} for user ${userId}${chatId ? ` chat ${chatId}` : ''}`);
    console.log('[SSE-ENDPOINT] Response state: writable=' + res.writable + ', writableEnded=' + res.writableEnded);
    
    // Keep the response open indefinitely
    res.on('close', () => {
      console.log('[SSE-ENDPOINT] Connection closed:', connectionId);
      unregisterSSEConnection(connectionId);
    });
    
    res.on('error', (err) => {
      console.error('[SSE-ENDPOINT] Connection error:', connectionId, err);
      unregisterSSEConnection(connectionId);
    });
  } catch (err) {
    console.error('[SSE-ENDPOINT] ❌ Connection error:', err);
    if (!res.writableEnded) {
      return res.status(500).json({ error: 'Internal server error', details: String(err) });
    }
  }
}
