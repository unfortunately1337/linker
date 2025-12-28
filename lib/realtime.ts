// Unified realtime adapter that can switch between Pusher and SSE
import { publishSSEEvent } from './sse';

// Check if Redis is configured (support both correct and legacy typo env names)
const USE_SSE = (process.env.REDIS_URL || process.env.REDDIS_URL) ? true : false;

interface RealtimeEvent {
  channel: string;
  event: string;
  data: any;
}

/**
 * Publish a realtime event using SSE
 */
export async function publishRealtimeEvent(channel: string, eventType: string, data: any): Promise<void> {
  try {
    // Use SSE with Redis
    await publishSSEEvent(channel, eventType, data);
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

export { USE_SSE };
