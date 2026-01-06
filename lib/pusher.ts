import Pusher from 'pusher';

let pusherInstance: Pusher | null = null;

export function getPusherInstance(): Pusher {
  if (!pusherInstance) {
    const appId = process.env.PUSHER_APP_ID;
    const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
    const secret = process.env.PUSHER_SECRET;
    const cluster = process.env.PUSHER_CLUSTER;

    if (!appId || !key || !secret || !cluster) {
      throw new Error('Missing Pusher configuration in environment variables');
    }

    pusherInstance = new Pusher({
      appId,
      key,
      secret,
      cluster,
      useTLS: true,
    });

    console.log('[PUSHER] ✅ Pusher instance initialized');
  }

  return pusherInstance;
}

/**
 * Broadcast message to a chat channel
 */
export async function broadcastToChat(chatId: string, event: string, data: any) {
  try {
    const pusher = getPusherInstance();
    const channelName = `chat-${chatId}`;
    
    await pusher.trigger(channelName, event, data);
    console.log(`[PUSHER] 📡 Broadcasted to ${channelName}:${event}`);
  } catch (err) {
    console.error('[PUSHER] ❌ Broadcast failed:', err);
    throw err;
  }
}

/**
 * Broadcast message to a user channel
 */
export async function broadcastToUser(userId: string, event: string, data: any) {
  try {
    const pusher = getPusherInstance();
    const channelName = `private-user-${userId}`;
    
    await pusher.trigger(channelName, event, data);
    console.log(`[PUSHER] 📡 Broadcasted to ${channelName}:${event}`);
  } catch (err) {
    console.error('[PUSHER] ❌ Broadcast failed:', err);
    throw err;
  }
}

/**
 * Generate auth token for private channel
 */
export function generateChannelAuth(socketId: string, channel: string): { auth: string; shared_secret?: string } {
  const pusher = getPusherInstance();
  const result = pusher.authorizeChannel(socketId, channel);
  return {
    auth: result.auth,
    shared_secret: result.shared_secret
  };
}
