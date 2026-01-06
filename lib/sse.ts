import { createClient } from 'redis';
import type { RedisClientType } from 'redis';
import type { NextApiResponse } from 'next';

// Types for SSE event structure
export interface SSEEvent {
  type: string;
  data: any;
  timestamp: number;
}

// In-memory store for active SSE connections
// Key: connectionId, Value: { res, channels, userId, chatId }
const activeConnections = new Map<string, {
  res: NextApiResponse;
  channels: Set<string>;
  userId?: string;
  chatId?: string;
  timeout?: NodeJS.Timeout;
}>();

// Redis client for pub/sub
let redisSubscriber: any = null;
let redisPublisher: any = null;

// Get or initialize Redis clients
async function getRedisClients() {
  await initRedis();
  return { redisSubscriber, redisPublisher };
}

// Initialize Redis clients
async function initRedis() {
  if (!redisSubscriber) {
    // Support both REDIS_URL and REDDIS_URL (legacy typo in .env)
    const redisUrl = process.env.REDIS_URL || process.env.REDDIS_URL || 'redis://localhost:6379';
    console.log('[SSE-INIT] Using Redis URL:', redisUrl.includes('@') ? redisUrl.split('@')[1] : redisUrl);
    
    redisSubscriber = createClient({ url: redisUrl });
    redisPublisher = createClient({ url: redisUrl });
    
    try {
      await redisSubscriber.connect();
      console.log('[SSE-INIT] ✅ Subscriber connected');
    } catch (err) {
      console.error('[SSE-INIT] ❌ Subscriber connection failed:', err);
      throw err;
    }
    
    try {
      await redisPublisher.connect();
      console.log('[SSE-INIT] ✅ Publisher connected');
    } catch (err) {
      console.error('[SSE-INIT] ❌ Publisher connection failed:', err);
      throw err;
    }
    
    console.log('[SSE-INIT] ✅ Redis clients connected');
    
    // Subscribe to all channels using pattern subscription
    console.log('[SSE-INIT] Setting up pSubscribe to pattern "*"');
    try {
      await redisSubscriber.pSubscribe('*', (message: string, channel: string) => {
        console.log(`[SSE-REDIS] Message on channel "${channel}" (${message.length} bytes)`);
        try {
          const event = JSON.parse(message);
          console.log(`[SSE-REDIS] Parsed event type=${event.type}`);
          broadcastToChannel(channel, event).catch(err => {
            console.error('[SSE-REDIS] Error broadcasting to channel:', err);
          });
        } catch (err) {
          console.error('[SSE-REDIS] Error parsing message:', err, 'message:', message.substring(0, 100));
        }
      });
      console.log('[SSE-INIT] ✅ pSubscribe setup complete');
    } catch (err) {
      console.error('[SSE-INIT] ❌ pSubscribe failed:', err);
      throw err;
    }
  }
}

// Register a new SSE connection
export async function registerSSEConnection(
  res: NextApiResponse,
  connectionId: string,
  userId?: string,
  chatId?: string
): Promise<void> {
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  });
  
  // Initialize Redis if needed
  await initRedis();
  
  const connection = {
    res,
    channels: new Set<string>(),
    userId,
    chatId,
    timeout: undefined as NodeJS.Timeout | undefined,
  };
  
  // Subscribe to user-specific channel if provided
  if (userId) {
    connection.channels.add(`user-${userId}`);
  }
  
  // Subscribe to chat-specific channel if provided
  if (chatId) {
    connection.channels.add(`chat-${chatId}`);
  }
  
  activeConnections.set(connectionId, connection);
  
  console.log(`[SSE] Registered connection ${connectionId} for user=${userId || 'anonymous'}, chatId=${chatId || 'none'}, channels=[${Array.from(connection.channels).join(', ')}]`);
  console.log(`[SSE] Active connections: ${activeConnections.size}`);
  
  // Send initial connection message
  console.log(`[SSE] Sending 'connected' event for connection ${connectionId}...`);
  const connectedSent = sendSSEMessage(res, {
    type: 'connected',
    data: { connectionId },
    timestamp: Date.now(),
  });
  if (connectedSent) {
    console.log(`[SSE] ✅ 'connected' event sent successfully for ${connectionId}`);
  } else {
    console.error(`[SSE] ❌ Failed to send 'connected' event for ${connectionId}`);
  }
  
  // Keep connection alive with heartbeat
  const heartbeat = setInterval(() => {
    sendSSEMessage(res, {
      type: 'ping',
      data: {},
      timestamp: Date.now(),
    });
  }, 30000); // Every 30 seconds
  
  // Store the interval so we can clear it later
  connection.timeout = heartbeat;
  
  // Handle client disconnect
  res.on('close', () => {
    clearInterval(heartbeat);
    const connectionInfo = activeConnections.get(connectionId);
    activeConnections.delete(connectionId);
    console.log(`[SSE] Connection ${connectionId} closed gracefully`);
    console.log(`[SSE] User ${userId || 'anonymous'} disconnected. Remaining connections: ${activeConnections.size}`);
    if (connectionInfo) {
      console.log(`[SSE] Connection summary - channels: [${Array.from(connectionInfo.channels).join(', ')}]`);
    }
  });
  
  res.on('error', (err: any) => {
    console.error(`[SSE] Connection ${connectionId} error:`, err?.message || err);
    clearInterval(heartbeat);
    const connectionInfo = activeConnections.get(connectionId);
    activeConnections.delete(connectionId);
    if (connectionInfo) {
      console.log(`[SSE] Cleaned up after error. User ${userId || 'anonymous'}, channels: [${Array.from(connectionInfo.channels).join(', ')}]`);
    }
    console.log(`[SSE] Active connections after error: ${activeConnections.size}`);
  });
}

// Unregister SSE connection
export function unregisterSSEConnection(connectionId: string): void {
  const connection = activeConnections.get(connectionId);
  if (connection && connection.timeout) {
    clearInterval(connection.timeout);
  }
  activeConnections.delete(connectionId);
}

// Send SSE message
export function sendSSEMessage(res: NextApiResponse, event: SSEEvent): boolean {
  try {
    const eventStr = `event: ${event.type}\n`;
    const dataStr = `data: ${JSON.stringify(event.data)}\n\n`;
    console.log(`[SSE-SEND] Writing event: type=${event.type}, writable=${res.writable}, writableEnded=${res.writableEnded}`);
    res.write(eventStr);
    res.write(dataStr);
    console.log(`[SSE-SEND] ✅ Event sent: ${event.type}`);
    return true;
  } catch (err) {
    console.error('[SSE-SEND] ❌ Error sending message:', err, 'event type:', event.type);
    return false;
  }
}

// Broadcast event to a specific channel
async function broadcastToChannel(channel: string, event: SSEEvent): Promise<void> {
  console.log(`[SSE] Broadcasting to channel ${channel}, type=${event.type}, total connections=${activeConnections.size}`);
  
  let broadcastCount = 0;
  let failedCount = 0;
  for (const [connectionId, connection] of activeConnections.entries()) {
    if (connection.channels.has(channel)) {
      broadcastCount++;
      const success = sendSSEMessage(connection.res, event);
      if (!success) {
        failedCount++;
        console.warn(`[SSE] Failed to send to connection ${connectionId} (userId: ${connection.userId || 'unknown'})`);
      }
    }
  }
  
  if (failedCount > 0) {
    console.warn(`[SSE] Broadcast complete with issues: sent to ${broadcastCount} connections (${failedCount} failed) out of ${activeConnections.size}`);
  } else {
    console.log(`[SSE] Broadcast complete: sent to ${broadcastCount} connections out of ${activeConnections.size}`);
  }
}

// Publish event to Redis (will be distributed to all servers)
export async function publishSSEEvent(
  channel: string,
  eventType: string,
  data: any
): Promise<void> {
  try {
    const { redisPublisher } = await getRedisClients();
    const event: SSEEvent = {
      type: eventType,
      data,
      timestamp: Date.now(),
    };
    
    const message = JSON.stringify(event);
    console.log(`[SSE-PUBLISH] 🔔 Publishing ${eventType} to ${channel}, message=${message.length} bytes`);
    console.log(`[SSE-PUBLISH] Event data keys:`, Object.keys(data));
    
    const numSubscribers = await redisPublisher.publish(channel, message);
    console.log(`[SSE-PUBLISH] ✅ Published to ${channel}, reached ${numSubscribers} subscriber(s)`);
    
    if (numSubscribers === 0) {
      console.warn(`[SSE-PUBLISH] ⚠️ WARNING: No subscribers on channel ${channel}`);
    }
  } catch (err) {
    console.error('[SSE-PUBLISH] ❌ Error publishing event:', err);
    throw err;
  }
}

// Subscribe connection to additional channel
export async function subscribeConnectionToChannel(
  connectionId: string,
  channel: string
): Promise<void> {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.channels.add(channel);
    console.log(`[SSE] Connection ${connectionId} subscribed to ${channel}`);
  }
}

// Unsubscribe connection from channel
export function unsubscribeConnectionFromChannel(
  connectionId: string,
  channel: string
): void {
  const connection = activeConnections.get(connectionId);
  if (connection) {
    connection.channels.delete(channel);
    console.log(`[SSE] Connection ${connectionId} unsubscribed from ${channel}`);
  }
}

// Get connection count for monitoring
export function getSSEConnectionCount(): number {
  return activeConnections.size;
}

// Get all active channels
export function getActiveChannels(): Map<string, Set<string>> {
  const channelMap = new Map<string, Set<string>>();
  for (const [, connection] of activeConnections.entries()) {
    for (const channel of connection.channels) {
      if (!channelMap.has(channel)) {
        channelMap.set(channel, new Set());
      }
      channelMap.get(channel)!.add(channel);
    }
  }
  return channelMap;
}

// Cleanup on server shutdown
process.on('SIGTERM', () => {
  activeConnections.forEach((connection) => {
    if (connection.timeout) clearInterval(connection.timeout);
    try {
      connection.res.end();
    } catch (err) {}
  });
  activeConnections.clear();
});
