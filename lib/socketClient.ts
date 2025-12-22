import { getPusherClient } from './pusher';

interface SocketClientAdapter {
  emit: (event: string, data?: any) => void;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string, callback: (data: any) => void) => void;
  _channels: Map<string, any>;
  _bindings: Map<string, any[]>;
}

let socketClientAdapter: SocketClientAdapter | null = null;

export function getSocketClient(): SocketClientAdapter | null {
  if (typeof window === 'undefined') return null;
  
  if (!socketClientAdapter) {
    const pusher = getPusherClient();
    if (!pusher) return null;
    
    socketClientAdapter = {
      _channels: new Map(),
      _bindings: new Map(),
      
      emit: (event: string, data?: any) => {
        // For client-side emits, we need to send to server via API
        // This is typically used for join-user, join-chat, typing events
        if (event === 'join-user' || event === 'join-chat' || event === 'typing') {
          // These would be handled via API calls instead
          console.log('[Socket Adapter] Emit:', event, data);
        }
      },
      
      on: (event: string, callback: (data: any) => void) => {
        if (!pusher) {
          console.error('[SocketClient.on] Pusher is null!');
          return;
        }
        
        const userId = (typeof window !== 'undefined') ? (window as any).__userId : null;
        const chatId = (typeof window !== 'undefined') ? (window as any).__chatId : null;
        console.log(`[SocketClient.on] Event: ${event}, userId:`, userId, 'chatId:', chatId);
        
        // Store callback for this event
        if (!socketClientAdapter!._bindings.has(event)) {
          socketClientAdapter!._bindings.set(event, []);
        }
        socketClientAdapter!._bindings.get(event)!.push(callback);
        
        // Subscribe to appropriate channels based on event
        let channels: string[] = [];
        
        if (event === 'status-changed' || event === 'friend-request' || event === 'webrtc-offer' || event === 'webrtc-answer' || event === 'webrtc-candidate' || event === 'webrtc-end') {
          // User-specific channel (requires user ID from session)
          if (typeof window !== 'undefined' && (window as any).__userId) {
            channels.push(`user-${(window as any).__userId}`);
          } else {
            console.warn(`[SocketClient.on] No userId for event: ${event}`);
          }
        } else if (event === 'new-message' || event === 'typing' || event === 'message-deleted' || event === 'message-status-changed') {
          // Chat-specific channel (requires chat ID)
          if (typeof window !== 'undefined' && (window as any).__chatId) {
            channels.push(`chat-${(window as any).__chatId}`);
          }
        } else if (event === 'viewer-state' || event === 'new-voice') {
          if (typeof window !== 'undefined' && (window as any).__chatId) {
            channels.push(`chat-${(window as any).__chatId}`);
          }
        }
        
        console.log(`[SocketClient.on] Channels for ${event}:`, channels);
        
        if (channels.length === 0) {
          console.warn(`[SocketClient.on] No channels found for event: ${event}`);
          return;
        }
        
        channels.forEach(channelName => {
          if (!socketClientAdapter!._channels.has(channelName)) {
            console.log(`[SocketClient.on] Subscribing to channel: ${channelName} for event: ${event}`);
            const subscription = pusher.subscribe(channelName);
            socketClientAdapter!._channels.set(channelName, subscription);
            console.log(`[SocketClient.on] Subscribed to ${channelName}`);
          }
          
          const subscription = socketClientAdapter!._channels.get(channelName);
          if (subscription) {
            console.log(`[SocketClient.on] Binding event '${event}' to channel '${channelName}'`);
            subscription.bind(event, callback);
            console.log(`[SocketClient.on] Successfully bound '${event}' to '${channelName}'`);
          } else {
            console.error(`[SocketClient.on] No subscription for channel: ${channelName}`);
          }
        });
      },
      
      off: (event: string, callback: (data: any) => void) => {
        if (!pusher) return;
        
        // Remove callback from bindings
        const callbacks = socketClientAdapter!._bindings.get(event);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) callbacks.splice(index, 1);
        }
        
        // Unbind from channels
        socketClientAdapter!._channels.forEach((subscription) => {
          subscription?.unbind(event, callback);
        });
      }
    };
  }
  
  return socketClientAdapter;
}
