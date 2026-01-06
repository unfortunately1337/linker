import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { publishMessageEvent, publishUserEvent } from '../../lib/realtime';
import { encryptMessage, decryptMessage } from '../../lib/encryption';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  let user = null;
  if (session && session.user?.id) {
    user = await prisma.user.findUnique({ where: { id: session.user.id } });
  } else if (session && session.user?.name) {
    user = await prisma.user.findUnique({ where: { login: session.user.name } });
  }
  if (!session || !user) {
    console.warn('[MESSAGES API] Unauthorized request — session missing');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Debug: log session and request method for easier diagnosis
  try {
    console.log('[MESSAGES API] method=', req.method, 'user=', { id: session.user?.id, name: session.user?.name });
  } catch (e) {
    console.error('[MESSAGES API] Failed to log session info', e);
  }

  if (req.method === 'GET') {
    // Получить сообщения по chatId (pagination supported)
    const { chatId, limit: qLimit, before } = req.query;
    if (!chatId || typeof chatId !== 'string') return res.status(400).json({ error: 'chatId required' });
    try {
      // Ensure the requesting user is a participant of the chat
      const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { users: true } });
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
      const isParticipant = (chat.users || []).some((u: any) => String(u.id) === String(user.id));
      if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

      const limit = Math.min(200, Number(qLimit) || 50); // cap for safety

      // If `before` provided, use it as an exclusive cursor for createdAt timestamp
      const where: any = { chatId };
      if (before && typeof before === 'string') {
        const beforeDate = new Date(before);
        if (!isNaN(beforeDate.getTime())) {
          where.createdAt = { lt: beforeDate };
        }
      }

      // Fetch newest messages (desc) limited by `limit`, then reverse to return ascending order.
      const msgs = await prisma.message.findMany({ 
        where, 
        orderBy: { createdAt: 'desc' }, 
        take: limit,
        select: {
          id: true,
          chatId: true,
          senderId: true,
          text: true,
          createdAt: true,
          status: true,
          audioUrl: true,
          videoUrl: true,
          sender: {
            select: {
              id: true,
              login: true,
              link: true,
              avatar: true
            }
          }
        }
      });
      const messages = msgs.reverse();

      // Decrypt text per-message; keep others if one fails.
      const decryptedMessages = messages.map((msg: any) => {
        let text = '';
        if (msg.text) {
          try {
            text = decryptMessage(msg.text, msg.chatId);
          } catch (dErr) {
            console.error('[MESSAGES GET] Failed to decrypt message', msg.id, dErr);
            text = '[Ошибка расшифровки]';
          }
        }
        
        return { ...msg, text };
      });

      // Fetch reactions for all messages from database
      const messageIds = decryptedMessages.map(m => m.id);
      let reactionsMap: Record<string, any[]> = {};
      
      try {
        // Get all reactions with user data in one query
        const reactionsFromDb = await prisma.reaction.findMany({
          where: { messageId: { in: messageIds } },
          select: {
            messageId: true,
            emoji: true,
            user: { select: { id: true, login: true, avatar: true } }
          }
        });

        // Group by messageId and emoji
        for (const reaction of reactionsFromDb) {
          if (!reactionsMap[reaction.messageId]) {
            reactionsMap[reaction.messageId] = [];
          }
          
          const existing = reactionsMap[reaction.messageId].find(r => r.emoji === reaction.emoji);
          if (existing) {
            existing.count += 1;
            existing.users.push(reaction.user);
            existing.userIds.push(reaction.user.id);
          } else {
            reactionsMap[reaction.messageId].push({
              emoji: reaction.emoji,
              count: 1,
              userIds: [reaction.user.id],
              users: [reaction.user]
            });
          }
        }
      } catch (reactErr) {
        console.warn('[MESSAGES GET] Failed to fetch reactions from DB:', reactErr);
        // Continue without reactions if DB fails
      }
      
      // Attach reactions to messages
      const messagesWithReactions = decryptedMessages.map((msg: any) => ({
        ...msg,
        reactions: reactionsMap[msg.id] || [],
        senderInfo: msg.sender ? {
          id: msg.sender.id,
          login: msg.sender.login,
          link: msg.sender.link,
          avatar: msg.sender.avatar
        } : undefined
      }));

      // hasMore -> true when we returned 'limit' items (there may be more older messages)
      const hasMore = msgs.length === limit;
      return res.status(200).json({ messages: messagesWithReactions, hasMore });
    } catch (err: any) {
      console.error('Failed to fetch messages for chatId', chatId, err);
      const payload: any = { error: 'Failed to fetch messages' };
      if (process.env.NODE_ENV !== 'production') {
        payload.details = err instanceof Error ? err.message : String(err);
        payload.stack = err instanceof Error && err.stack ? err.stack : undefined;
      }
      return res.status(500).json(payload);
    }
  }

  if (req.method === 'PUT') {
    const { chatId } = req.body;
    if (!chatId || typeof chatId !== 'string') return res.status(400).json({ error: 'chatId required' });
    // Ensure the requesting user is a participant
    const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { users: true } });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    const isParticipant = (chat.users || []).some((u: any) => u.id === user.id);
    if (!isParticipant) return res.status(403).json({ error: 'Forbidden' });

    await prisma.chatUnread.upsert({
      where: { chatId_userId: { chatId, userId: user.id } },
      update: { count: 0 },
      create: { chatId, userId: user.id, count: 0 }
    });
    return res.status(200).json({ ok: true });
  }
  if (req.method === 'POST') {
    // Включаем CORS для быстрого ответа
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');

    const { chatId, text } = req.body || {};
    // Avoid logging full plaintext. Only log minimal metadata for diagnostics.
    try {
      console.log('[MESSAGES API][POST] incoming body:', { chatId, textLength: typeof text === 'string' ? text.length : null });
    } catch (e) {}
    if (!chatId || typeof chatId !== 'string' || !text || typeof text !== 'string') {
      console.warn('[MESSAGES API][POST] bad request body');
      return res.status(400).json({ error: 'chatId and text required' });
    }

    try {
      // Ensure chat exists and the sender is a participant
      const chat = await prisma.chat.findUnique({ where: { id: chatId }, include: { users: true } });
      if (!chat) {
        console.warn('[MESSAGES API][POST] chat not found', chatId);
        return res.status(404).json({ error: 'Chat not found' });
      }
      const isParticipant = (chat.users || []).some((u: any) => String(u.id) === String(user.id));
      if (!isParticipant) {
        console.warn('[MESSAGES API][POST] user not participant', { userId: user.id, chatId });
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Check if this is a 1:1 chat and if the user is blocked
      if ((chat.users?.length || 0) === 2) {
        const recipient = chat.users?.find((u: any) => String(u.id) !== String(user.id));
        if (recipient) {
          const isBlocked = await prisma.blockedUser.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: recipient.id,
                blockedId: user.id
              }
            }
          });
          if (isBlocked) {
            console.warn('[MESSAGES API][POST] user is blocked by recipient', { userId: user.id, recipientId: recipient.id });
            return res.status(403).json({ error: 'You are blocked by this user' });
          }
        }
      }

      // Шифруем сообщение (защищаем шифрование отдельным try)
      let encryptedText: string;
      try {
        encryptedText = encryptMessage(text, chatId);
      } catch (encErr: any) {
        console.error('[MESSAGES API][POST] encryptMessage failed');
        return res.status(500).json({ error: 'Encryption failed', details: String(encErr?.message || encErr) });
      }

      // Создаём сообщение в БД со статусом sent
      const message = await prisma.message.create({
        data: { chatId, senderId: user.id, text: encryptedText, createdAt: new Date(), status: 'sent' }
      });

      // Не включаем plaintext в ответ/пушер — отправляем только метаданные и id.
      const messageMeta = {
        id: message.id,
        chatId: message.chatId,
        senderId: message.senderId,
        sender: message.senderId,
        createdAt: message.createdAt,
        status: message.status,
        audioUrl: (message as any).audioUrl || null,
        videoUrl: (message as any).videoUrl || null,
        senderInfo: {
          id: user.id,
          login: user.login,
          link: (user as any).link || null,
          avatar: user.avatar || null
        }
      } as any;

      // Параллельно - обновления и Pusher
      (async () => {
        try {
          const recipients = chat.users?.filter((u: any) => u.id !== user.id) || [];
          const upserts = recipients.map((u: any) => prisma.chatUnread.upsert({ where: { chatId_userId: { chatId, userId: u.id } }, update: { count: { increment: 1 } }, create: { chatId, userId: u.id, count: 1 } }));

          // Prepare a lightweight payload for user-level notifications (no plaintext)
          const userPayload = {
            chatId,
            senderId: user.id,
            senderName: (user as any).link || user.login || (user as any).name || 'Unknown',
            senderLink: (user as any).link || null,
            senderAvatar: user.avatar || null,
            senderRole: (user as any).role || null,
            // content omitted intentionally
          };

          // Trigger chat channel and per-user channels in parallel (SSE/Pusher)
          try {
            await publishMessageEvent(chatId, 'new-message', messageMeta);
          } catch (e) {
            console.error('[MESSAGES API] Failed to publish chat message', e);
          }
          recipients.forEach((r: any) => {
            try {
              publishUserEvent(r.id, 'status-changed', userPayload).catch((e: any) => {
                console.error('[MESSAGES API] Failed to publish user notification for', r.id, e);
              });
            } catch (e) {
              console.error('[MESSAGES API] Failed to publish user notification for', r.id, e);
            }
          });

          await Promise.all(upserts);
        } catch (bgErr) {
          console.error('[MESSAGES API][POST][BG] background error', bgErr);
        }
      })();

      // Return metadata only (client-side keeps optimistic text). Do not include plaintext.
      return res.status(200).json({ message: messageMeta });
    } catch (error: any) {
      console.error('Message send error (top):', error);
      // Return details to help debugging (include stack) — remove/limit this in production when fixed
      return res.status(500).json({ error: 'Failed to send message', details: String(error?.message || error), stack: error?.stack });
    }
  }
}

