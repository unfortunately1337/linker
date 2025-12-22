import type { NextApiRequest, NextApiResponse } from 'next';
import { getSocket } from '../../../lib/socket';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { to, sdp, from, fromName, fromAvatar } = req.body || {};
    if (!to || !sdp) return res.status(400).json({ error: 'Missing to or sdp' });

    const channel = `user-${to}`;
    console.log(`[API calls/start] Sending webrtc-offer to channel: ${channel} from user: ${from}`);
    // Relay offer to target via Pusher
    const pusher = getSocket();
    if (pusher) {
      await pusher.trigger(channel, 'webrtc-offer', { from, sdp, fromName, fromAvatar });
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('calls/start error', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
