import Pusher from 'pusher-js';

interface RealtimeEventListener {
  (data: any): void;
}

class PusherClient {
  private pusherInstance: Pusher | null = null;
  private channels: Map<string, any> = new Map();
  private bindings: Map<string, RealtimeEventListener[]> = new Map();
  private userId: string | null = null;
  private chatId: string | undefined = undefined;

  constructor() {}

  /**
   * Initialize Pusher connection
   */
  connect(userId: string, chatId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.userId = userId;
        this.chatId = chatId;

        const appKey = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
        const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

        if (!appKey || !cluster) {
          throw new Error('Missing Pusher configuration: NEXT_PUBLIC_PUSHER_APP_KEY or NEXT_PUBLIC_PUSHER_CLUSTER');
        }

        console.log(`[PUSHER-CLIENT] 🔌 Connecting as user ${userId}${chatId ? ` to chat ${chatId}` : ''}`);

        this.pusherInstance = new Pusher(appKey, {
          cluster,
          authEndpoint: '/api/pusher/auth',
          auth: {
            headers: {
              'Content-Type': 'application/json',
            },
          },
        });

        // Handle connection events
        this.pusherInstance.connection.bind('connected', () => {
          console.log('[PUSHER-CLIENT] ✅ Connected to Pusher');
          this.subscribeToChannels();
          resolve();
        });

        this.pusherInstance.connection.bind('error', (err: any) => {
          console.error('[PUSHER-CLIENT] ❌ Connection error:', err);
          reject(err);
        });

        this.pusherInstance.connection.bind('disconnected', () => {
          console.log('[PUSHER-CLIENT] ⚠️ Disconnected from Pusher');
        });
      } catch (err) {
        console.error('[PUSHER-CLIENT] ❌ Initialization error:', err);
        reject(err);
      }
    });
  }

  /**
   * Subscribe to necessary channels
   */
  private subscribeToChannels() {
    if (!this.pusherInstance) return;

    // Subscribe to user channel (private)
    const userChannelName = `private-user-${this.userId}`;
    console.log(`[PUSHER-CLIENT] 📢 Subscribing to ${userChannelName}`);
    const userChannel = this.pusherInstance.subscribe(userChannelName);
    this.channels.set(userChannelName, userChannel);

    // Subscribe to chat channel if provided
    if (this.chatId) {
      const chatChannelName = `chat-${this.chatId}`;
      console.log(`[PUSHER-CLIENT] 📢 Subscribing to ${chatChannelName}`);
      const chatChannel = this.pusherInstance.subscribe(chatChannelName);
      this.channels.set(chatChannelName, chatChannel);
    }
  }

  /**
   * Subscribe to event
   */
  on(eventType: string, callback: RealtimeEventListener): void {
    if (!this.pusherInstance) {
      console.warn('[PUSHER-CLIENT] ⚠️ Pusher not initialized');
      return;
    }

    console.log(`[PUSHER-CLIENT] 👂 Listening for ${eventType}`);

    if (!this.bindings.has(eventType)) {
      this.bindings.set(eventType, []);
    }
    this.bindings.get(eventType)!.push(callback);

    // Parse event type to determine channel
    // Format: "channel-name:event-name" or just "event-name"
    if (eventType.includes(':')) {
      const [channelType, event] = eventType.split(':');
      let channel: any;

      // Subscribe to chat channel if needed
      if (channelType.startsWith('chat-')) {
        const chatChannelName = channelType;
        if (!this.channels.has(chatChannelName)) {
          console.log(`[PUSHER-CLIENT] 📢 Subscribing to ${chatChannelName}`);
          const chatChannel = this.pusherInstance.subscribe(chatChannelName);
          this.channels.set(chatChannelName, chatChannel);
        }
        channel = this.channels.get(chatChannelName);
      } 
      // Subscribe to user channel if needed
      else if (channelType.startsWith('user-')) {
        const userId = channelType.replace('user-', '');
        const userChannelName = `private-user-${userId}`;
        if (!this.channels.has(userChannelName)) {
          console.log(`[PUSHER-CLIENT] 📢 Subscribing to ${userChannelName}`);
          const userChannel = this.pusherInstance.subscribe(userChannelName);
          this.channels.set(userChannelName, userChannel);
        }
        channel = this.channels.get(userChannelName);
      }

      if (channel) {
        channel.bind(event, callback);
      }
    } else {
      // Fallback for generic events
      this.pusherInstance.bind(eventType, callback);
    }
  }

  /**
   * Unsubscribe from event
   */
  off(eventType: string, callback: RealtimeEventListener): void {
    if (!this.pusherInstance) return;

    console.log(`[PUSHER-CLIENT] 🔇 Unsubscribe from ${eventType}`);

    if (eventType.includes(':')) {
      const [channelType, event] = eventType.split(':');
      let channel: any;

      if (channelType.startsWith('chat-')) {
        channel = this.channels.get(channelType);
      } else if (channelType.startsWith('user-')) {
        const userId = channelType.replace('user-', '');
        const userChannelName = `private-user-${userId}`;
        channel = this.channels.get(userChannelName);
      }

      if (channel) {
        channel.unbind(event, callback);
      }
    } else {
      this.pusherInstance.unbind(eventType, callback);
    }

    // Remove from bindings
    const listeners = this.bindings.get(eventType);
    if (listeners) {
      const idx = listeners.indexOf(callback);
      if (idx > -1) {
        listeners.splice(idx, 1);
      }
    }
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    if (this.pusherInstance) {
      this.pusherInstance.disconnect();
      this.pusherInstance = null;
      console.log('[PUSHER-CLIENT] 🔌 Disconnected');
    }
  }
}

let pusherClientInstance: PusherClient | null = null;

export function getPusherClient(): PusherClient {
  if (!pusherClientInstance) {
    pusherClientInstance = new PusherClient();
  }
  return pusherClientInstance;
}

export async function initializePusher(userId: string, chatId?: string): Promise<void> {
  const client = getPusherClient();
  return client.connect(userId, chatId);
}

export function disconnectPusher(): void {
  const client = getPusherClient();
  client.disconnect();
}
