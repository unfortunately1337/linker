// @ts-ignore
declare module 'formidable';
import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { publishChatEvent } from '../../../lib/realtime';
// Compatible parsing with multiple `formidable` versions
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const uploadDir = path.join(process.cwd(), 'public', 'voice');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  // Use dynamic parseForm to handle various formidable shapes
  function parseForm(req: NextApiRequest) {
    return new Promise<{ fields: any; files: any }>((resolve, reject) => {
      try {
        const formidableLib = require('formidable');
        let createForm: any = null;
        if (typeof formidableLib === 'function') createForm = formidableLib;
        else if (formidableLib && typeof formidableLib.default === 'function') createForm = formidableLib.default;
        else if (formidableLib && typeof formidableLib.IncomingForm === 'function') createForm = (opts: any) => new formidableLib.IncomingForm(opts);
        if (!createForm) return reject(new Error('Formidable module has unexpected shape'));
        const form = createForm({ uploadDir, keepExtensions: true, allowEmptyFiles: false });
        if (typeof form.parse === 'function') form.parse(req, (err2: any, fields: any, files: any) => err2 ? reject(err2) : resolve({ fields, files }));
        else if (typeof (form as any).then === 'function') (form as any).then((parsed: any) => resolve(parsed)).catch(reject);
        else reject(new Error('Formidable parse method not available'));
      } catch (err) { reject(err); }
    });
  }

  const { fields, files } = await parseForm(req);
    const { chatId } = fields;
    const audio = files.audio;
    if (!chatId || !audio) {
      return res.status(400).json({ error: 'chatId and audio required' });
    }
    const audioPath = path.join('voice', path.basename(audio.filepath));
    const audioUrl = `/voice/${path.basename(audio.filepath)}`;
    // Сохраняем сообщение с ссылкой на аудиофайл
    const message = await prisma.message.create({
      data: {
        chatId: String(chatId),
        senderId: session.user.id,
        text: '',
        createdAt: new Date(),
        audioUrl: String(audioUrl)
      }
    });
    try {
      await publishChatEvent(String(chatId), 'new-voice', { ...message, audioUrl });
    } catch (e) {
      console.error('[VOICE MESSAGE] Error publishing:', e);
    }
    return res.status(200).json({ message });
}
