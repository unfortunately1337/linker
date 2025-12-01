import type { NextApiRequest, NextApiResponse } from 'next';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { getStoragePath, ensureDir } from '../../../lib/storage';

import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
// No encryption for video files — store raw files under pages/api/.private_media/video
import { pusher } from '../../../lib/pusher';
import { uploadLimiter } from '../../../lib/rateLimiter';

export const config = {
  api: {
    bodyParser: false,
  },
};

function parseForm(req: NextApiRequest): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    // Support several possible `formidable` shapes (callable default, .default, or IncomingForm)
    try {
      const formidableLib = require('formidable');
      let createForm: any = null;
      if (typeof formidableLib === 'function') {
        createForm = formidableLib;
      } else if (formidableLib && typeof formidableLib.default === 'function') {
        createForm = formidableLib.default;
      } else if (formidableLib && typeof formidableLib.IncomingForm === 'function') {
        createForm = (opts: any) => new formidableLib.IncomingForm(opts);
      }
      if (!createForm) {
        return reject(new Error('Formidable module has unexpected shape'));
      }
      const form = createForm({
        multiples: false,
        allowEmptyFiles: false,
        keepExtensions: true,
        maxFileSize: 50 * 1024 * 1024, // 50MB
      });
      if (typeof form.parse === 'function') {
        form.parse(req, (err: any, fields: any, files: any) => {
          if (err) reject(err);
          else resolve({ fields, files });
        });
      } else if (typeof (form as any).parse === 'undefined' && typeof (form as any).then === 'function') {
        // In case some versions return a promise-like API
        (form as any).then((parsed: any) => resolve(parsed)).catch(reject);
      } else {
        reject(new Error('Formidable parse method not available'));
      }
    } catch (err) {
      reject(err);
    }
  });
}

export default async function videoUploadHandler(req: NextApiRequest, res: NextApiResponse) {
  // CORS: prefer echoing request origin when present so credentialed requests work.
  const origin = (req.headers.origin as string) || '';
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  // Handle preflight quickly
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  if (req.method === 'POST') {
    // Публикация видео
    try {
      const { fields, files } = await parseForm(req);
      let video = files.video;
      if (Array.isArray(video)) video = video[0];
      if (!video) {
        res.status(400).json({ error: 'No video file' });
        return;
      }

      const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100 MB
      const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];

      // Validate file size
      if (video.size && video.size > MAX_VIDEO_SIZE) {
        return res.status(413).json({
          error: 'Video file too large',
          maxSize: '100 MB'
        });
      }

      // Validate MIME type
      if (video.mimetype && !ALLOWED_VIDEO_TYPES.includes(video.mimetype)) {
        return res.status(400).json({
          error: 'Invalid video format',
          allowed: ALLOWED_VIDEO_TYPES
        });
      }

      let chatId = fields.chatId;
      if (Array.isArray(chatId)) chatId = chatId[0];
      if (!chatId) {
        res.status(400).json({ error: 'No chatId provided' });
        return;
      }

  let videoUrl: string;
  let thumbnailUrl: string | undefined = undefined;
      try {
        // Require authenticated user early so we can include owner info in filename
        const session = await getServerSession(req, res, authOptions);
        const userId = session?.user?.id;
        if (!userId) {
          return res.status(401).json({ error: 'Unauthorized: login required to upload video' });
        }

        // Save the uploaded video file (no encryption) into our writable storage
        const uploadDir = getStoragePath('video');
        if (!ensureDir(uploadDir)) {
          throw new Error(`Unable to create upload dir: ${uploadDir}`);
        }
        const fileName = `${userId}-${Date.now()}-circle.webm`;
        const filePath = path.join(uploadDir, fileName);

        const tmpPath = (video as any)?.filepath || (video as any)?.path || (video as any)?.tempFilePath || (video as any)?.file?.path;
        if (!tmpPath) {
          throw new Error('Temporary upload path is missing on parsed file');
        }
        try {
          await fs.promises.access(tmpPath, fs.constants.R_OK);
        } catch (accessErr) {
          console.error('[VIDEO UPLOAD] Temp file is not accessible:', accessErr);
          throw accessErr;
        }

        const fileBuffer = await fs.promises.readFile(tmpPath);
        if (!fileBuffer || fileBuffer.length === 0) throw new Error('Uploaded video is empty');

        // Atomic write: write to temp file then rename to final path
        const tempPath = `${filePath}.tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        await fs.promises.writeFile(tempPath, fileBuffer);
        // Rename is atomic on most filesystems
        await fs.promises.rename(tempPath, filePath);

        // Verify file exists
        const exists = fs.existsSync(filePath);
        console.log('[VIDEO UPLOAD] File saved (atomic):', filePath, 'exists:', exists, 'host:', os.hostname(), 'pid:', process.pid);

        // Expose media via API streaming route
        // Use /api/media/video/<fileName> so client can fetch directly.
        videoUrl = `/api/media/video/${fileName}`;
        // If a thumbnail was uploaded alongside video, persist it too and expose via API
        let thumbnailUrl: string | undefined = undefined;
        try {
          let thumb = files.thumbnail;
          if (Array.isArray(thumb)) thumb = thumb[0];
          if (thumb) {
            const thumbTmpPath = (thumb as any)?.filepath || (thumb as any)?.path || (thumb as any)?.tempFilePath || (thumb as any)?.file?.path;
            if (thumbTmpPath) {
              const thumbExt = path.extname((thumb as any)?.originalFilename || (thumb as any)?.name || '') || '.jpg';
              const thumbName = `${userId}-${Date.now()}-thumb${thumbExt}`;
              const thumbDest = path.join(uploadDir, thumbName);
              try {
                const thumbBuf = await fs.promises.readFile(thumbTmpPath);
                const tmpThumb = `${thumbDest}.tmp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                await fs.promises.writeFile(tmpThumb, thumbBuf);
                await fs.promises.rename(tmpThumb, thumbDest);
                thumbnailUrl = `/api/media/video/${thumbName}`;
                console.log('[VIDEO UPLOAD] Thumbnail saved:', thumbDest);
              } catch (thumbErr) {
                console.warn('[VIDEO UPLOAD] Failed to save thumbnail:', thumbErr);
              }
            }
          }
        } catch (thumbProcErr) {
          console.warn('[VIDEO UPLOAD] Thumbnail processing error:', thumbProcErr);
        }
      } catch (error: any) {
        console.error('[VIDEO UPLOAD] Error:', error);
        res.status(500).json({ error: 'Video processing failed', details: error.message || 'Unknown error' });
        return;
      }
      const session = await getServerSession(req, res, authOptions);
      const userId = session?.user?.id;
      if (!chatId) {
        res.status(400).json({ error: 'No chatId provided', fields });
        return;
      }
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized: no userId from session', session });
        return;
      }
      let message: any = null;
      let dbError: any = null;
      let persisted = false;
      try {
        // Create DB message record. We don't persist thumbnail URL in DB schema (no column),
        // but we include it in the response/pusher payload so clients can use it.
        message = await prisma.message.create({
          data: {
            chatId,
            senderId: userId,
            text: '',
            videoUrl,
          },
        });
        persisted = !!(message && message.id);
      } catch (err: any) {
        console.error('[VIDEO UPLOAD] Prisma create failed', err);
        dbError = { message: err?.message || String(err), stack: err?.stack };
        message = { id: `temp-${Date.now()}`, chatId, senderId: userId, text: '', createdAt: new Date().toISOString() };
        persisted = false;
      }
      // Уведомляем подписчиков через Pusher
      try {
        const payload: any = { id: message.id, sender: userId, text: '', createdAt: message.createdAt, videoUrl, persisted, dbError };
        if (thumbnailUrl) payload.thumbnailUrl = thumbnailUrl;
        await pusher.trigger(`chat-${chatId}`, 'new-message', payload);
      } catch (pErr) {
        console.error('[VIDEO UPLOAD] Pusher trigger failed:', pErr);
      }
      // Include debug fields so the client/dev can verify file was actually saved
      const savedFilePath = path.join(getStoragePath('video'), path.basename(videoUrl));
      const fileSaved = fs.existsSync(savedFilePath);
  res.status(200).json({ videoUrl, thumbnailUrl, message, persisted, dbError, fileName: path.basename(savedFilePath), fileSaved });
    } catch (e) {
      console.error('Video upload error:', e);
      res.status(500).json({ error: 'Upload failed', details: String(e) });
    }
  } else if (req.method === 'DELETE') {
    // Делегируем удаление сообщения на единый endpoint /api/messages/[id]
    // Этот блок сохранлён для совместимости — перенаправляем на основной обработчик
    try {
      const { id } = req.query;
      if (!id || typeof id !== 'string') {
        res.status(400).json({ error: 'No message id provided' });
        return;
      }
      // Переиспользуем основной обработчик: перенаправляем запрос
      // Клиент ожидает 204 или ошибку
      const fetch = require('node-fetch');
      const serverRes = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/messages/${id}`, { method: 'DELETE', headers: { cookie: req.headers.cookie || '' } });
      const text = await serverRes.text();
      if (serverRes.status === 204) return res.status(204).end();
      try { return res.status(serverRes.status).json(JSON.parse(text)); } catch { return res.status(serverRes.status).send(text); }
    } catch (e) {
      console.error('Video delete proxy error:', e);
      res.status(500).json({ error: 'Delete failed', details: String(e) });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return uploadLimiter(req, res, () => videoUploadHandler(req, res));
}
