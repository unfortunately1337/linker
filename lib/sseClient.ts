/**
 * SSE Client adapter - replaces Pusher client with Server-Sent Events
 * Compatible with the existing socketClient adapter interface
 */

interface RealtimeEventListener {
  (data: any): void;
}

interface SSEChannel {
  listeners: Map<string, Set<RealtimeEventListener>>;
  connected: boolean;
}

class SSEClient {
  private eventSource: EventSource | null = null;
  private channels: Map<string, SSEChannel> = new Map();
  private userId: string | null = null;
  private chatId: string | undefined = undefined;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageQueue: Array<{ event: string; data: any }> = [];
  private pendingListeners: Array<{ eventType: string; callback: RealtimeEventListener }> = [];

  constructor() {}

  /**
   * Initialize SSE connection
   */
  connect(userId: string, chatId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.eventSource) {
        this.eventSource.close();
      }

      this.userId = userId;
      this.chatId = chatId;

      const params = new URLSearchParams();
      params.append('userId', userId);
      if (chatId) params.append('chatId', chatId);

      const url = `/api/sse?${params.toString()}`;
      console.log(`[SSE-CLIENT] 🔌 Connecting to ${url}`);

      try {
        this.eventSource = new EventSource(url);

        // Handle connection
        this.eventSource.addEventListener('connected', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            console.log('[SSE-CLIENT] ✅ Connected:', data);
            this.reconnectAttempts = 0;
            
            // Process any pending listeners that were queued before connection
            if (this.pendingListeners.length > 0) {
              console.log(`[SSE-CLIENT] 📋 Processing ${this.pendingListeners.length} pending listeners`);
              this.pendingListeners.forEach(({ eventType, callback }) => {
                this.on(eventType, callback);
              });
              this.pendingListeners = [];
            }
            
            resolve();
          } catch (err) {
            console.error('[SSE-CLIENT] Error parsing connected event:', err);
            resolve();
          }
        });

        // Handle ping to keep connection alive
        this.eventSource.addEventListener('ping', () => {
          console.log('[SSE-CLIENT] 💓 Ping received');
        });

        // Handle error
        this.eventSource.addEventListener('error', (e: any) => {
          console.error('[SSE-CLIENT] ❌ EventSource error:', e);
          this.handleDisconnect();
        });

        // Generic event handler - listen to all event types
        const eventHandler = (eventName: string) => {
          return (event: Event) => {
            try {
              const msgEvent = event as any;
              const data = msgEvent.data ? JSON.parse(msgEvent.data) : null;
              console.log(`[SSE-CLIENT] 📨 Event received: ${eventName}`, data);
              this.handleEvent(eventName, data);
            } catch (err) {
              console.error(`[SSE-CLIENT] ❌ Failed to parse ${eventName} event:`, err);
            }
          };
        };

        // Listen for common event types
        const eventTypes = [
          'new-message',
          'message-deleted',
          'message-status-changed',
          'message-reactions-changed',
          'reaction-added',
          'reaction-removed',
          'typing-indicator',
          'viewer-state',
          'status-changed',
          'friend-request',
          'webrtc-offer',
          'webrtc-answer',
          'webrtc-candidate',
          'webrtc-end',
          'new-voice',
        ];

        eventTypes.forEach(eventType => {
          console.log(`[SSE-CLIENT] 👂 Adding listener for: ${eventType}`);
          this.eventSource?.addEventListener(eventType, eventHandler(eventType));
        });

        // Keep generic message handler as fallback
        this.eventSource.onmessage = (event: any) => {
          try {
            // Try to parse as named event data
            const data = JSON.parse(event.data);
            // If data has type field, use it
            if (data.type && data.data) {
              this.handleEvent(data.type, data.data);
            }
          } catch (err) {
            // Ignore - handled by named event handlers
          }
        };

        this.eventSource.onerror = () => {
          console.error('[SSE] Connection error');
          this.handleDisconnect();
        };
      } catch (err) {
        console.error('[SSE] Connection failed:', err);
        reject(err);
      }
    });
  }

  /**
   * Handle disconnect and attempt reconnect
   */
  private handleDisconnect(): void {
    console.warn(`[SSE-CLIENT] ⚠️ Disconnected (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      console.log(`[SSE-CLIENT] 🔄 Attempting reconnect in ${delay}ms...`);
      setTimeout(() => {
        if (this.userId) {
          this.connect(this.userId, this.chatId || undefined).catch((err) => {
            console.error('[SSE-CLIENT] ❌ Reconnect failed:', err);
          });
        }
      }, delay);
    } else {
      console.error('[SSE-CLIENT] ❌ Max reconnect attempts reached');
    }
  }

  /**
   * Handle incoming event
   */
  private handleEvent(eventType: string, data: any): void {
    // Emit to all listeners for this event type
    // Check both user and chat channels
    const userChannel = this.userId ? `user-${this.userId}` : null;
    const chatChannel = this.chatId ? `chat-${this.chatId}` : null;

    [userChannel, chatChannel].forEach((channel) => {
      if (channel) {
        const channelInfo = this.channels.get(channel);
        if (channelInfo) {
          // Handle different event types
          let targetEvent = eventType;
          
          // Map message-reactions-changed to reaction-added/removed for compatibility
          if (eventType === 'message-reactions-changed') {
            // Store the reaction change data
            if (data.emoji_removed) {
              targetEvent = 'reaction-removed';
            } else {
              targetEvent = 'reaction-added';
            }
          }
          
          const listeners = channelInfo.listeners.get(targetEvent);
          if (listeners) {
            listeners.forEach((listener) => {
              try {
                listener(data);
              } catch (err) {
                console.error(`[SSE] Error in listener for ${targetEvent}:`, err);
              }
            });
          }
        }
      }
    });
  }

  /**
   * Subscribe to an event
   */
  on(eventType: string, callback: RealtimeEventListener): void {
    // If userId or chatId not set yet, queue the listener for later
    if (!this.userId) {
      console.log(`[SSE-CLIENT] 📋 Queuing listener for ${eventType} (not connected yet)`);
      this.pendingListeners.push({ eventType, callback });
      return;
    }

    // Register callback for this event type on both potential channels
    const userChannel = this.userId ? `user-${this.userId}` : null;
    const chatChannel = this.chatId ? `chat-${this.chatId}` : null;

    console.log(`[SSE-CLIENT] 👂 on(${eventType}) - user channel=${userChannel}, chat channel=${chatChannel}`);

    [userChannel, chatChannel].forEach((channel) => {
      if (channel) {
        if (!this.channels.has(channel)) {
          console.log(`[SSE-CLIENT] Creating channel info for ${channel}`);
          this.channels.set(channel, {
            listeners: new Map(),
            connected: true,
          });
        }

        const channelInfo = this.channels.get(channel)!;
        if (!channelInfo.listeners.has(eventType)) {
          channelInfo.listeners.set(eventType, new Set());
        }
        channelInfo.listeners.get(eventType)!.add(callback);
        console.log(`[SSE-CLIENT] ✅ Listener added for ${eventType} on ${channel}`);
      }
    });
  }

  /**
   * Unsubscribe from an event
   */
  off(eventType: string, callback: RealtimeEventListener): void {
    const userChannel = this.userId ? `user-${this.userId}` : null;
    const chatChannel = this.chatId ? `chat-${this.chatId}` : null;

    [userChannel, chatChannel].forEach((channel) => {
      if (channel && this.channels.has(channel)) {
        const channelInfo = this.channels.get(channel)!;
        const listeners = channelInfo.listeners.get(eventType);
        if (listeners) {
          listeners.delete(callback);
        }
      }
    });
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel: string): any {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, {
        listeners: new Map(),
        connected: true,
      });
    }

    const channelInfo = this.channels.get(channel)!;
    return {
      bind: (eventType: string, callback: RealtimeEventListener) => {
        if (!channelInfo.listeners.has(eventType)) {
          channelInfo.listeners.set(eventType, new Set());
        }
        channelInfo.listeners.get(eventType)!.add(callback);
        console.log(`[SSE] Bound event ${eventType} to channel ${channel}`);
      },
      unbind: (eventType: string, callback: RealtimeEventListener) => {
        const listeners = channelInfo.listeners.get(eventType);
        if (listeners) {
          listeners.delete(callback);
        }
      },
    };
  }

  /**
   * Disconnect SSE
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.channels.clear();
    console.log('[SSE] Disconnected');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.eventSource !== null && this.eventSource.readyState === EventSource.OPEN;
  }
}

// Singleton instance
let sseClientInstance: SSEClient | null = null;

/**
 * Get or create SSE client instance
 */
export function getSSEClient(): SSEClient {
  if (!sseClientInstance) {
    sseClientInstance = new SSEClient();
  }
  return sseClientInstance;
}

/**
 * Initialize SSE for a specific user and optional chat
 */
export async function initializeSSE(userId: string, chatId?: string): Promise<void> {
  const client = getSSEClient();
  await client.connect(userId, chatId);
}

/**
 * Close SSE connection
 */
export function closeSSE(): void {
  const client = getSSEClient();
  client.disconnect();
}
