// Deprecated: Socket module - use realtime.ts instead
import { publishRealtimeEvent } from './realtime';

export function getSocket() {
  // Deprecated: returns null - use realtime.ts instead
  return null;
}

export async function emitEvent(channel: string, event: string, data: any) {
  try {
    await publishRealtimeEvent(channel, event, data);
  } catch (error) {
    console.error(`Failed to emit event ${event} on channel ${channel}:`, error);
  }
}
