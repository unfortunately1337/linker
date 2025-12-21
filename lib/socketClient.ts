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
        if (!pusher) return;
        
        // Store callback for this event
        if (!socketClientAdapter!._bindings.has(event)) {
          socketClientAdapter!._bindings.set(event, []);
        }
        socketClientAdapter!._bindings.get(event)!.push(callback);
        
        // Subscribe to appropriate channels based on event
        let channels: string[] = [];
        
        if (event === 'status-changed' || event === 'friend-request') {
          // User-specific channel (requires user ID from session)
          if (typeof window !== 'undefined' && (window as any).__userId) {
            channels.push(`user-${(window as any).__userId}`);
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
        
        channels.forEach(channelName => {
          if (!socketClientAdapter!._channels.has(channelName)) {
            const subscription = pusher.subscribe(channelName);
            socketClientAdapter!._channels.set(channelName, subscription);
          }
          
          const subscription = socketClientAdapter!._channels.get(channelName);
          subscription?.bind(event, callback);
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
