import type { NextApiRequest, NextApiResponse } from 'next';
import { publishUserEvent } from '../../../lib/realtime';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();
  try {
    const { to, candidate, from } = req.body || {};
    if (!to || !candidate) return res.status(400).json({ error: 'Missing to or candidate' });
    try {
      await publishUserEvent(to, 'webrtc-candidate', { from, candidate });
    } catch (e) {
      console.error('[CALLS/CANDIDATE] Error publishing webrtc-candidate:', e);
    }
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('calls/candidate error', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
