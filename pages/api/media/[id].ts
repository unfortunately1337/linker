import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
// Helper to detect MIME by typical file signatures
function detectMimeFromBuffer(buf: Buffer): string {
  if (!buf || buf.length < 12) return 'application/octet-stream';
  const s = buf.toString('ascii', 0, 12);
  // WEBP: 'RIFF' + 4 bytes + 'WEBP' at offset 8
  if (s.startsWith('RIFF') && s.indexOf('WEBP') >= 8) return 'image/webp';
  // PNG: 0x89 0x50 0x4E 0x47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  // JPEG: 0xFF 0xD8
  if (buf[0] === 0xFF && buf[1] === 0xD8) return 'image/jpeg';
  return 'application/octet-stream';
}
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createS3Client, getS3Bucket } from '../../../lib/s3';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (!id || Array.isArray(id)) return res.status(400).end();

  const media = await (prisma as any).media.findUnique({ where: { id } });
  if (!media) return res.status(404).end();

  if (media.provider === 'db' && media.data) {
    console.log('/api/media/[id] serving DB media', { id, size: media.size, mime: media.mime });
    res.setHeader('Content-Type', media.mime || 'application/octet-stream');
    try {
      // Ensure Buffer type for send
      const buf = Buffer.isBuffer(media.data) ? media.data : Buffer.from(media.data as any);
      // Detect mime from content and compare to stored mime; override if mismatch
      const detected = detectMimeFromBuffer(buf);
      if (media.mime !== detected) {
        console.warn('/api/media/[id] declared mime does not match content; overriding', { id, declared: media.mime, detected });
        if ((process.env.AUTO_FIX_MEDIA_MIME || 'false').toLowerCase() === 'true') {
          try {
            await prisma.media.update({ where: { id }, data: { mime: detected } as any });
            console.log('/api/media/[id] patched media.mime to detected mime', { id, new: detected });
          } catch (err) { console.warn('/api/media/[id] failed to auto-patch media.mime', { id, err }); }
        }
      }
      res.setHeader('X-Debug-Declared-Mime', String(media.mime || ''));
      res.setHeader('X-Debug-Detected-Mime', String(detected || ''));
      res.setHeader('X-Debug-Bytes', String(buf.length));
      const accept = String(req.headers.accept || '').toLowerCase();
      let outBuf = buf;
      let outMime = detected || (media.mime || 'application/octet-stream');
      // If client doesn't accept webp but we have webp bytes, try converting to JPEG to maximize compatibility
      if (outMime === 'image/webp' && !accept.includes('image/webp')) {
        try {
          const sharpLib = (() => { try { return require('sharp'); } catch (e) { return null; } })();
          if (sharpLib) {
            outBuf = await sharpLib(outBuf).toFormat('jpeg', { quality: 80 }).toBuffer();
            outMime = 'image/jpeg';
            console.log('/api/media/[id] converted webp -> jpeg for client without webp support', { id });
          }
        } catch (e) { console.warn('/api/media/[id] webp conversion fallback failed', { id, err: e }); }
      }
      res.setHeader('Content-Type', outMime);
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.status(200).send(buf);
    } catch (e) {
      console.error('[MEDIA API] Error serving media:', (e as any)?.message);
      res.setHeader('Cache-Control', 'no-cache');
      const isDev = process.env.NODE_ENV === 'development';
      return res.status(500).json({
        error: 'Failed to serve media',
        ...(isDev && { detail: String((e as any)?.message) })
      });
    }
  }

  // S3/MinIO provider: generate signed URL and redirect
  const s3 = createS3Client();
  const bucket = getS3Bucket();
  if (s3 && bucket && media.key) {
    try {
      const cmd = new GetObjectCommand({ Bucket: bucket, Key: media.key });
      const url = await getSignedUrl(s3, cmd, { expiresIn: 60 * 60 });
      return res.redirect(307, url);
    } catch (e) {
      console.error('s3 presign error', e);
      return res.status(500).json({ error: 'Failed to generate url', detail: String((e as any)?.message || e) });
    }
  }

  return res.status(404).end();
}
