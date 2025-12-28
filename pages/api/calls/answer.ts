import type { NextApiRequest, NextApiResponse } from 'next';
import { publishUserEvent } from '../../../lib/realtime';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { to, sdp, from } = req.body || {};
    if (!to || !sdp) return res.status(400).json({ error: 'Missing to or sdp' });
    try {
      await publishUserEvent(to, 'webrtc-answer', { from, sdp });
    } catch (e) {
      console.error('[CALLS/ANSWER] Error publishing webrtc-answer:', e);
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('calls/answer error', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
