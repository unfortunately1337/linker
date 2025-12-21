import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { decryptMessage } from '../../../lib/encryption';
import path from 'path';
import fs from 'fs';
import { getSocket } from '../../../lib/socket';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

import { getStoragePath } from '../../../lib/storage';

// Our media storage is located under getStoragePath('voice'|'video')

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('[DELETE MESSAGE] Start handling delete request');
  
  if (req.method !== 'DELETE') {
    console.log('[DELETE MESSAGE] Wrong method:', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    console.log('[DELETE MESSAGE] Unauthorized attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    console.log('[DELETE MESSAGE] Invalid message ID:', id);
    return res.status(400).json({ error: 'Invalid message ID' });
  }

  try {
    console.log('[DELETE MESSAGE] Looking for message:', id);
    const msg = await prisma.message.findUnique({ 
      where: { id },
      select: {
        id: true,
        senderId: true,
        chatId: true,
        text: true,
        audioUrl: true,
        videoUrl: true
      }
    });

    // Добавляем небольшую задержку
    await sleep(100);
    
    if (!msg) {
      console.log('[DELETE MESSAGE] Message not found:', id);
      return res.status(404).json({ error: 'Message not found' });
    }
    
    if (String(msg.senderId) !== String(session.user.id)) {
      console.log('[DELETE MESSAGE] Unauthorized delete attempt:', { 
        messageId: id, 
        requesterId: session.user.id,
        ownerId: msg.senderId 
      });
      return res.status(403).json({ error: 'You can only delete your own messages' });
    }

    // (no special protection here) message deletion via this endpoint is allowed for message owners

    // Удаляем сообщение из базы данных сразу — это основная операция
    console.log('[DELETE MESSAGE] Deleting message from database:', id);
    let deleted;
    try {
      deleted = await prisma.message.delete({ where: { id } });
      console.log('[DELETE MESSAGE] Message successfully deleted from DB:', id);
    } catch (dbErr) {
      console.error('[DELETE MESSAGE] Prisma delete error:', dbErr);
      // Re-throw to be caught by outer catch and return 500
      throw dbErr;
    }

    // Файлы и Pusher выполняем в фоне — не блокируем ответ клиенту
    (async () => {
      try {
        // tryUnlink with a couple of retries — sometimes filesystem locks/antivirus cause transient errors
        const tryUnlink = async (fullPath: string, attempts = 3) => {
          for (let i = 0; i < attempts; i++) {
            try {
              if (fs.existsSync(fullPath)) {
                await fs.promises.unlink(fullPath);
                console.log('[DELETE MESSAGE][BG] File deleted:', fullPath);
                return true;
              } else {
                console.log('[DELETE MESSAGE][BG] File not found (skip):', fullPath);
                return false;
              }
            } catch (e) {
              console.error(`[DELETE MESSAGE][BG] Error deleting file (attempt ${i+1}/${attempts}):`, fullPath, e);
              // small backoff
              await new Promise(r => setTimeout(r, 120 * (i+1)));
            }
          }
          console.error('[DELETE MESSAGE][BG] Failed to delete file after retries:', fullPath);
          return false;
        };

        if (msg.audioUrl) {
          const audioFileName = path.basename(msg.audioUrl);
          const fullPath = path.join(getStoragePath('voice'), audioFileName || '');
          await tryUnlink(fullPath);
        }

        if (msg.videoUrl) {
          const videoFileName = path.basename(msg.videoUrl);
          const fullPath = path.join(getStoragePath('video'), videoFileName || '');
          await tryUnlink(fullPath);
        }

        // Уведомляем подписчиков через Pusher
        try {
          if (msg.chatId) {
            const pusher = getSocket();
            if (pusher) {
              await pusher.trigger(`chat-${msg.chatId}`, 'message-deleted', {
                messageId: id,
                chatId: msg.chatId,
                deletedBy: session.user.id
              });
            }
            console.log('[DELETE MESSAGE][BG] Pusher event sent for chat:', msg.chatId);
          }
        } catch (pErr) {
          console.error('[DELETE MESSAGE][BG] Pusher trigger error:', pErr);
        }
      } catch (bgErr) {
        console.error('[DELETE MESSAGE][BG] Background cleanup error:', bgErr);
      }
    })();

    return res.status(204).end();
    
  } catch (error) {
    console.error('Error in message deletion:', error);
    const payload: any = { error: 'Internal server error', details: error instanceof Error ? error.message : String(error), stack: error instanceof Error && error.stack ? error.stack : undefined };
    return res.status(500).json(payload);
  }
}
