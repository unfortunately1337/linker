import type { NextApiRequest, NextApiResponse } from 'next';
import { publishUserEvent } from '../../../lib/realtime';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { to, from, reason } = req.body || {};
    if (!to) return res.status(400).json({ error: 'Missing to' });
    // reason can be 'declined' or 'ended'
    const payload = { from: from || null, reason: reason || null };
    try {
      // trigger to the 'to' (recipient) so they get notified
      await publishUserEvent(to, 'webrtc-end', payload);
      // also trigger back to the sender if provided, to ensure both clients receive the event
      if (from) {
        try {
          await publishUserEvent(from, 'webrtc-end', payload);
        } catch (e) {
          // don't fail the whole request if notifying sender fails
          console.warn('calls/end: failed to notify sender', e);
        }
      }
    } catch (e) {
      console.error('[CALLS/END] Error publishing webrtc-end:', e);
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('calls/end error', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
