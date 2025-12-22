import Pusher from 'pusher';
import PusherClient from 'pusher-js';

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

if (!appId || !key || !secret || !cluster) {
  console.error('[PUSHER] Missing environment variables:', {
    appId: !!appId,
    key: !!key,
    secret: !!secret,
    cluster: !!cluster
  });
}

export const pusher = new Pusher({
  appId: appId || 'missing',
  key: key || 'missing',
  secret: secret || 'missing',
  cluster: cluster || 'missing',
  useTLS: true,
});

let _pusherClient: any = null;

export function getPusherClient() {
  if (typeof window === 'undefined') return null;
  if (_pusherClient) return _pusherClient;
  const publicKey = process.env.NEXT_PUBLIC_PUSHER_KEY || '';
  const publicCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || '';
  console.log('[Pusher] Initializing with key:', publicKey ? 'exists' : 'missing', 'cluster:', publicCluster);
  if (!publicKey) {
    console.error('[Pusher] No public key available');
    return null;
  }
  _pusherClient = new PusherClient(publicKey as string, { cluster: publicCluster as string });
  console.log('[Pusher] Client initialized');
  return _pusherClient;
}
