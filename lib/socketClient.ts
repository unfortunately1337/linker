import { getSSEClient, initializeSSE } from './sseClient';

const USE_SSE = true;  // Always use SSE on client, Pusher support removed

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
    // Always use SSE adapter on client
    socketClientAdapter = createSSEAdapter();
  }
  
  return socketClientAdapter;
}

/**
 * Create SSE-based adapter
 */
function createSSEAdapter(): SocketClientAdapter {
  let sseInitialized = false;

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
          }).catch(e => console.error('[SSE] Failed to send typing event:', e));
        }
      }
      console.log('[SSE Adapter] Emit:', event, data);
    },
    
    on: (event: string, callback: (data: any) => void) => {
      const userId = (typeof window !== 'undefined') ? (window as any).__userId : null;
      const chatId = (typeof window !== 'undefined') ? (window as any).__chatId : null;
      
      console.log(`[SSE.on] Event: ${event}, userId:`, userId, 'chatId:', chatId, 'sseInitialized:', sseInitialized);
      
      // Store callback for this event
      if (!socketClientAdapter!._bindings.has(event)) {
        socketClientAdapter!._bindings.set(event, []);
      }
      socketClientAdapter!._bindings.get(event)!.push(callback);
      
      // Get SSE client and register the listener (this works even if not connected yet)
      const sseClient = getSSEClient();
      sseClient.on(event, callback);
      
      console.log(`[SSE.on] Registered listener for event: ${event}`);
      
      // Initialize SSE connection if not already done (do this AFTER registering listener)
      if (!sseInitialized && userId) {
        console.log('[SSE.on] Initializing SSE with userId:', userId, 'chatId:', chatId);
        sseInitialized = true;
        initializeSSE(userId, chatId).catch((err) => {
          console.error('[SSE] Failed to initialize:', err);
          sseInitialized = false;
        });
      }
    },
    
    off: (event: string, callback: (data: any) => void) => {
      // Remove callback from bindings
      const callbacks = socketClientAdapter!._bindings.get(event);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      }
      
      // Unregister from SSE client
      const sseClient = getSSEClient();
      sseClient.off(event, callback);
    }
  };
}
