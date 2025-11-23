import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getStoragePath } from '../../../lib/storage';
import prisma from '../../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const session = await getServerSession(req, res, authOptions);
    if (!session || !session.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const url = (req.body && req.body.url) || req.query.url;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'No url provided' });
    }

    // Normalize (strip querystring)
    const clean = url.split('?')[0];
    const filename = path.basename(clean);

    // Determine subfolder by inspecting the url
    let subfolder: 'video' | 'voice' | null = null;
    const lower = clean.toLowerCase();
  if (lower.includes('/video/') || lower.includes('/media/linker/video/') || lower.includes('/api/media/video/') || lower.includes('/media/video/')) subfolder = 'video';
  if (lower.includes('/voice/') || lower.includes('/media/linker/voice/') || lower.includes('/api/media/voice/') || lower.includes('/media/voice/')) subfolder = 'voice';

    if (!subfolder) {
      // As a fallback, try to infer from extension
      if (filename.endsWith('.webm') || filename.endsWith('.mp4') || filename.endsWith('.mov')) subfolder = 'video';
      if (filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.ogg') || filename.endsWith('.webm')) subfolder = subfolder || 'voice';
    }

    if (!subfolder) {
      return res.status(400).json({ error: 'Cannot determine media type from url' });
    }

    const storageDir = getStoragePath(subfolder);
    const targetPath = path.join(storageDir, filename);

    // Security: ensure the target path is inside storageDir
    const normalizedTarget = path.normalize(targetPath);
    const normalizedDir = path.normalize(storageDir + path.sep);
    if (!normalizedTarget.startsWith(normalizedDir)) {
      console.warn('[MEDIA-DELETE] Attempt to delete outside storage:', normalizedTarget);
      return res.status(400).json({ error: 'Invalid target path' });
    }

    // If the file is referenced by messages, only the message sender(s) may delete it.
    try {
      const refs = await prisma.message.findMany({ where: { OR: [{ audioUrl: { contains: filename } }, { videoUrl: { contains: filename } }] }, select: { id: true, senderId: true } });
      if (refs && refs.length > 0) {
        // If any referencing message is not owned by the requester, reject deletion
        const nonOwned = refs.some(r => String(r.senderId) !== String(session.user.id));
        if (nonOwned) {
          console.warn('[MEDIA-DELETE] Attempt to delete media file referenced by message(s) not owned by requester:', filename, 'user:', session.user.id);
          return res.status(403).json({ error: 'Cannot delete media file referenced by other users' });
        }
        // Owned by the requester — we'll clear references in DB after deleting the file
      }
    } catch (e) {
      const msg = (e && (e as any).message) ? (e as any).message : String(e);
      console.warn('[MEDIA-DELETE] DB lookup failed (continuing):', msg);
    }

    // Only allow deletion of orphaned media files (no DB refs) by the uploader (filename must contain user id)
    const userId = String(session.user.id);

    if (fs.existsSync(normalizedTarget)) {
      try {
        await fs.promises.unlink(normalizedTarget);
        console.log('[MEDIA-DELETE] Deleted file:', normalizedTarget, 'by user:', session.user.id);
        // Also clear DB references if any messages referenced this filename and are owned by the requester
        try {
          await prisma.message.updateMany({
            where: { OR: [{ audioUrl: { contains: filename } }, { videoUrl: { contains: filename } }] , senderId: String(session.user.id) },
            data: { audioUrl: null, videoUrl: null }
          });
        } catch (dbUpdErr) {
          console.warn('[MEDIA-DELETE] Failed to clear DB references after file deletion:', dbUpdErr && (dbUpdErr as any).message ? (dbUpdErr as any).message : String(dbUpdErr));
        }
        return res.status(200).json({ ok: true, deleted: filename });
      } catch (e: any) {
        console.error('[MEDIA-DELETE] Error deleting file:', normalizedTarget, e && e.message ? e.message : e);
        return res.status(500).json({ error: 'Failed to delete file', details: e && e.message ? e.message : String(e) });
      }
    }

    // Not found — return 404 to indicate nothing to remove
    return res.status(404).json({ error: 'File not found' });
  } catch (err: any) {
    console.error('[MEDIA-DELETE] Unexpected error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Internal server error', details: err && err.message ? err.message : String(err) });
  }
}
