import { pusher } from './pusher';

export function getSocket() {
  return pusher;
}

export async function emitEvent(channel: string, event: string, data: any) {
  try {
    await pusher.trigger(channel, event, data);
  } catch (error) {
    console.error(`Failed to emit event ${event} on channel ${channel}:`, error);
  }
}
