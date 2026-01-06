import { getPusherClient, initializePusher, disconnectPusher } from './pusherClient';

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
    // Always use Pusher adapter on client
    socketClientAdapter = createPusherAdapter();
  }
  
  return socketClientAdapter;
}

/**
 * Create Pusher-based adapter
 */
function createPusherAdapter(): SocketClientAdapter {
  let pusherInitialized = false;

  return {
    _channels: new Map(),
    _bindings: new Map(),
    
    emit: (event: string, data?: any) => {
      // For client-side emits, we need to send to server via API
      if (event === 'typing') {
        const chatId = (typeof window !== 'undefined') ? (window as any).__chatId : null;
        if (chatId) {
          fetch('/api/messages/typing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId })
          }).catch(e => console.error('[PUSHER] Failed to send typing event:', e));
        }
      }
      console.log('[PUSHER-ADAPTER] Emit:', event, data);
    },
    
    on: (event: string, callback: (data: any) => void) => {
      const userId = (typeof window !== 'undefined') ? (window as any).__userId : null;
      const chatId = (typeof window !== 'undefined') ? (window as any).__chatId : null;
      
      console.log(`[SOCKET-ADAPTER] on(${event}): userId=${userId}, chatId=${chatId}, pusherInitialized=${pusherInitialized}`);
      
      // Store callback for this event
      if (!socketClientAdapter!._bindings.has(event)) {
        socketClientAdapter!._bindings.set(event, []);
      }
      socketClientAdapter!._bindings.get(event)!.push(callback);
      
      // Get Pusher client and register the listener
      const pusherClient = getPusherClient();
      console.log(`[SOCKET-ADAPTER] Registering callback on Pusher for ${event}`);
      pusherClient.on(event, callback);
      
      console.log(`[SOCKET-ADAPTER] ✅ Listener registered: ${event}`);
      
      // Initialize Pusher connection if not already done
      if (!pusherInitialized && userId) {
        console.log('[SOCKET-ADAPTER] 🔌 Initializing Pusher with userId=' + userId + ', chatId=' + (chatId || 'none'));
        pusherInitialized = true;
        const initStartTime = Date.now();
        initializePusher(userId, chatId).then(() => {
          const initDuration = Date.now() - initStartTime;
          console.log(`[SOCKET-ADAPTER] ✅ Pusher initialized successfully (${initDuration}ms)`);
        }).catch((err) => {
          const initDuration = Date.now() - initStartTime;
          console.error(`[SOCKET-ADAPTER] ❌ Failed to initialize Pusher after ${initDuration}ms:`, err);
          pusherInitialized = false;
        });
      } else if (pusherInitialized) {
        console.log('[SOCKET-ADAPTER] Pusher already initialized');
      } else {
        console.warn('[SOCKET-ADAPTER] ⚠️ userId is null, cannot initialize Pusher');
      }
    },
    
    off: (event: string, callback: (data: any) => void) => {
      // Remove callback from bindings
      const callbacks = socketClientAdapter!._bindings.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
      
      // Unregister from Pusher client
      const pusherClient = getPusherClient();
      pusherClient.off(event, callback);
    }
  };
}
