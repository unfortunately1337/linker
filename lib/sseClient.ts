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
  private eventListenerMap: Map<string, EventListener> = new Map();
  private connectionTimeout: NodeJS.Timeout | null = null;
  private lostEvents: Array<{ type: string; timestamp: number }> = [];
  private maxLostEventsHistory = 100;

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
      const connectStartTime = Date.now();
      console.log(`[SSE-CLIENT] 🔌 Connecting to ${url}`);

      let fallbackTimer: NodeJS.Timeout | null = null;
      // Set connection timeout (30 seconds) - increased from 10s for slower networks
      this.connectionTimeout = setTimeout(() => {
        console.error('[SSE-CLIENT] ❌ Connection timeout after 30s');
        console.error(`[SSE-CLIENT] Failed to connect to ${url}`);
        if (fallbackTimer) clearTimeout(fallbackTimer);
        if (this.eventSource) {
          try {
            this.eventSource.close();
          } catch (e) {
            console.error('[SSE-CLIENT] Error closing EventSource on timeout:', e);
          }
          this.eventSource = null;
        }
        reject(new Error('SSE connection timeout after 30s - check if /api/sse endpoint is responding'));
      }, 30000);

      try {
        this.eventSource = new EventSource(url);
        console.log('[SSE-CLIENT] EventSource created, awaiting connection...');

        // Handle open (when connection is established)
        this.eventSource.onopen = () => {
          console.log('[SSE-CLIENT] ℹ️ EventSource opened, readyState:', this.eventSource?.readyState);
        };

        // Fallback: if readyState becomes OPEN (1) and we haven't connected in 5s, resolve anyway
        fallbackTimer = setTimeout(() => {
          if (this.eventSource?.readyState === 1 && this.connectionTimeout) {
            console.log('[SSE-CLIENT] ⚠️  Fallback: readyState is OPEN but "connected" event did not arrive within 5s. Resolving anyway...');
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
            resolve();
          }
        }, 5000);

        // Handle connection
        this.eventSource.addEventListener('connected', (event: any) => {
          try {
            console.log('[SSE-CLIENT] 📨 Received "connected" event, event.data:', event.data);
            // Clear fallback timer
            if (fallbackTimer) clearTimeout(fallbackTimer);
            // Clear connection timeout on successful connection
            if (this.connectionTimeout) {
              clearTimeout(this.connectionTimeout);
              this.connectionTimeout = null;
            }
            const connectTime = Date.now() - connectStartTime;
            const data = JSON.parse(event.data);
            console.log(`[SSE-CLIENT] ✅ Connected (${connectTime}ms):`, data);
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
          console.error('[SSE-CLIENT] ❌ EventSource error event fired:', {
            readyState: this.eventSource?.readyState,
            message: e?.message,
            url,
            type: e?.type
          });
          if (fallbackTimer) clearTimeout(fallbackTimer);
          // EventSource.CLOSED = 2
          if (this.eventSource?.readyState === 2) {
            console.error('[SSE-CLIENT] Connection closed (readyState=2). Check if /api/sse endpoint is working');
            this.handleDisconnect();
          }
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
          console.error('[SSE-CLIENT] ❌ Connection error via onerror handler');
          this.handleDisconnect();
        };
      } catch (err) {
        console.error('[SSE-CLIENT] ❌ Failed to create EventSource:', err, 'url:', url);
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
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
          if (listeners && listeners.size > 0) {
            listeners.forEach((listener) => {
              try {
                listener(data);
              } catch (err) {
                console.error(`[SSE] Error in listener for ${targetEvent}:`, err);
              }
            });
          } else {
            // Log lost event if no listeners
            console.warn(`[SSE-CLIENT] ⚠️ No listeners for event: ${targetEvent} on channel ${channel}. Event lost!`);
            this.recordLostEvent(eventType);
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
   * Record lost event for monitoring
   */
  private recordLostEvent(eventType: string): void {
    this.lostEvents.push({ type: eventType, timestamp: Date.now() });
    if (this.lostEvents.length > this.maxLostEventsHistory) {
      this.lostEvents.shift();
    }
  }

  /**
   * Get lost events history
   */
  getLostEvents(): Array<{ type: string; timestamp: number }> {
    return [...this.lostEvents];
  }

  /**
   * Disconnect SSE
   */
  disconnect(): void {
    // Clear connection timeout if pending
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.eventSource) {
      // Remove all event listeners to prevent memory leaks
      console.log('[SSE-CLIENT] 🧹 Cleaning up event listeners...');
      this.eventListenerMap.forEach((listener, eventType) => {
        try {
          this.eventSource?.removeEventListener(eventType, listener);
        } catch (err) {
          console.error(`[SSE-CLIENT] Error removing listener for ${eventType}:`, err);
        }
      });
      this.eventListenerMap.clear();

      try {
        this.eventSource.close();
      } catch (err) {
        console.error('[SSE-CLIENT] Error closing EventSource:', err);
      }
      this.eventSource = null;
    }

    // Clear all channel listeners
    this.channels.forEach((channelInfo) => {
      channelInfo.listeners.clear();
    });
    this.channels.clear();

    // Clear pending listeners
    this.pendingListeners = [];

    console.log('[SSE-CLIENT] ✅ Disconnected and cleaned up');
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
