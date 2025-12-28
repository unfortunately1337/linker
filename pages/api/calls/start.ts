import type { NextApiRequest, NextApiResponse } from 'next';
import { publishUserEvent } from '../../../lib/realtime';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { to, sdp, from, fromName, fromAvatar } = req.body || {};
    if (!to || !sdp) return res.status(400).json({ error: 'Missing to or sdp' });

    console.log(`[API calls/start] Sending webrtc-offer to user: ${to} from user: ${from}`);
    // Relay offer to target via SSE/Pusher
    try {
      await publishUserEvent(to, 'webrtc-offer', { from, sdp, fromName, fromAvatar });
    } catch (e) {
      console.error('[CALLS/START] Error publishing webrtc-offer:', e);
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('calls/start error', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
