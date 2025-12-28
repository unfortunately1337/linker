/**
 * SSE Debug logging helper
 * Provides detailed logging for SSE troubleshooting
 */

export const sseDebug = {
  // Redis events
  redisConnecting: () => console.log('[SSE-DEBUG] Redis connecting...'),
  redisConnected: () => console.log('[SSE-DEBUG] ✅ Redis connected'),
  redisError: (err: any) => console.error('[SSE-DEBUG] ❌ Redis error:', err?.message || err),
  redisSubscribing: (pattern: string) => console.log(`[SSE-DEBUG] Subscribing to pattern: ${pattern}`),
  redisMessageReceived: (channel: string, size: number) => console.log(`[SSE-DEBUG] Redis message received on ${channel} (${size} bytes)`),

  // Connection events
  connectionRegistered: (id: string, userId: string, chatId: string | null, channels: string[]) => 
    console.log(`[SSE-DEBUG] ✅ Connection registered: ${id}, user=${userId}, chat=${chatId}, channels=${channels.join(',')}`),
  connectionClosed: (id: string) => console.log(`[SSE-DEBUG] ⚠️ Connection closed: ${id}`),
  connectionError: (id: string, err: any) => console.error(`[SSE-DEBUG] ❌ Connection error ${id}:`, err),
  activeConnectionsCount: (count: number) => console.log(`[SSE-DEBUG] Active connections: ${count}`),

  // Publishing events
  publishStarted: (channel: string, type: string) => console.log(`[SSE-DEBUG] Publishing ${type} to ${channel}`),
  publishError: (err: any) => console.error('[SSE-DEBUG] ❌ Publish error:', err),
  publishSuccess: (channel: string) => console.log(`[SSE-DEBUG] ✅ Published to ${channel}`),

  // Broadcasting events
  broadcastStarted: (channel: string, type: string) => console.log(`[SSE-DEBUG] Broadcasting ${type} to channel ${channel}`),
  broadcastSent: (connectionId: string, success: boolean) => console.log(`[SSE-DEBUG] Sent to ${connectionId}: ${success ? '✅' : '❌'}`),
  broadcastComplete: (sent: number, total: number) => console.log(`[SSE-DEBUG] Broadcast: sent to ${sent}/${total} connections`),

  // SSE message sending
  messageSending: (type: string, size: number) => console.log(`[SSE-DEBUG] Sending SSE message: ${type} (${size} bytes)`),
  messageSendError: (err: any) => console.error('[SSE-DEBUG] ❌ Send error:', err),

  // Client side
  clientConnecting: (userId: string, chatId: string | null) => console.log(`[SSE-CLIENT] Connecting with user=${userId}, chat=${chatId}`),
  clientConnected: (data: any) => console.log(`[SSE-CLIENT] ✅ Connected:`, data),
  clientError: (err: any) => console.error('[SSE-CLIENT] ❌ Connection error:', err),
  clientDisconnect: (reason: string) => console.log(`[SSE-CLIENT] ⚠️ Disconnected: ${reason}`),
  clientEventReceived: (type: string, data: any) => console.log(`[SSE-CLIENT] ✅ Event received: ${type}`, data),
  clientEventHandler: (type: string, callbacks: number) => console.log(`[SSE-CLIENT] Event ${type} has ${callbacks} listener(s)`),

  // Socket adapter
  adapterInitializing: (userId: string, chatId: string | null) => console.log(`[ADAPTER] Initializing with user=${userId}, chat=${chatId}`),
  adapterInitialized: () => console.log(`[ADAPTER] ✅ Initialized`),
  adapterError: (err: any) => console.error('[ADAPTER] ❌ Error:', err),
  adapterListenerRegistered: (event: string) => console.log(`[ADAPTER] ✅ Listener registered: ${event}`),
};
