// Unified realtime adapter that switches to Pusher for reliability
import { broadcastToChat, broadcastToUser } from './pusher';

const USE_PUSHER = true; // Always use Pusher

interface RealtimeEvent {
  channel: string;
  event: string;
  data: any;
}

/**
 * Publish a realtime event using Pusher
 */
export async function publishRealtimeEvent(channel: string, eventType: string, data: any): Promise<void> {
  try {
    // Extract channel type and ID
    if (channel.startsWith('chat-')) {
      const chatId = channel.replace('chat-', '');
      await broadcastToChat(chatId, eventType, data);
    } else if (channel.startsWith('user-')) {
      const userId = channel.replace('user-', '');
      await broadcastToUser(userId, eventType, data);
    } else {
      console.warn('[Realtime] Unknown channel type:', channel);
    }
  } catch (err) {
    console.error('[Realtime] Error publishing event:', err);
  }
}

/**
 * Publish message event
 */
export async function publishMessageEvent(chatId: string, eventType: 'new-message' | 'message-deleted' | 'message-status-changed' | 'message-reactions-changed', data: any): Promise<void> {
  await publishRealtimeEvent(`chat-${chatId}`, eventType, data);
}

/**
 * Publish user event (status, friend request, etc)
 */
export async function publishUserEvent(userId: string, eventType: 'status-changed' | 'friend-request' | 'webrtc-offer' | 'webrtc-answer' | 'webrtc-candidate' | 'webrtc-end', data: any): Promise<void> {
  await publishRealtimeEvent(`user-${userId}`, eventType, data);
}

/**
 * Publish chat-specific event (typing, etc)
 */
export async function publishChatEvent(chatId: string, eventType: 'typing-indicator' | 'new-voice' | 'viewer-state' | 'reaction-added' | 'reaction-removed' | 'message-reactions-changed', data: any): Promise<void> {
  await publishRealtimeEvent(`chat-${chatId}`, eventType, data);
}

export { USE_PUSHER };
