                                                                                                                                                                                                                                                                      import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
import { decryptMessage } from '../../lib/encryption';
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  let user = null;
  if (session && session.user?.id) {
    user = await prisma.user.findUnique({ where: { id: session.user.id } });
  } else if (session && session.user?.name) {
    user = await prisma.user.findUnique({ where: { login: session.user.name } });
  }
  console.log('API /api/chats: session.user', session.user);
  console.log('API /api/chats: resolved user', user);
  if (!session || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { name, userIds } = req.body;
    // Название может быть null для 1:1 чатов
    if (name !== null && name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Название должно быть строкой или null' });
    }
    // Гарантируем, что текущий пользователь всегда в группе
    let allUserIds = Array.isArray(userIds) ? [...userIds] : [];
    if (!allUserIds.includes(user.id)) {
      allUserIds.push(user.id);
    }
    if (allUserIds.length < 2) {
      return res.status(400).json({ error: 'Минимум 2 участника' });
    }
    // Создать чат и добавить пользователей
    const chat = await prisma.chat.create({
      data: {
        name: name || null, // null for 1:1 chats
        users: {
          connect: allUserIds.map((id: string) => ({ id }))
        }
      },
      include: { users: true }
    });
    return res.status(200).json({ chat });
  }

  if (req.method === 'GET') {
    const { userIds } = req.query;
    if (userIds && typeof userIds === 'string') {
      const ids = userIds.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length === 2) {
          // Ищем личный чат между двумя пользователями
          let chat = await prisma.chat.findFirst({
            where: {
              AND: [
                { name: null }, // Only 1:1 chats (without name)
                { users: { every: { id: { in: ids } } } }
              ]
            },
            include: { users: true }
          });
          // Дополнительно проверяем, что в чате ровно два пользователя
          if (chat && chat.users.length !== 2) {
            chat = null;
          }
          // Return what we found (or null if nothing) - don't auto-create
          return res.status(200).json({ chat: chat || null });
      }
    }
    // Получить все чаты пользователя
    // Fetch chats and include users (with sessions) and the latest message to avoid N+1 queries
    const chats = await prisma.chat.findMany({
      where: { users: { some: { id: user.id } } },
      include: {
        users: {
          select: {
            id: true,
            login: true,
            link: true,
            avatar: true,
            role: true,
            backgroundUrl: true,
            status: true,
            sessions: { select: { id: true, createdAt: true, isActive: true } }
          }
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true, text: true, createdAt: true, senderId: true, audioUrl: true, videoUrl: true }
        }
      }
    });

    const chatsWithStatus = chats.map((chat: any) => {
      const usersWithStatus = (chat.users || []).map((full: any) => {
        const saved = full.status;
        const allowed = ['online', 'offline', 'dnd'];
        const status = (typeof saved === 'string' && allowed.includes(saved))
          ? saved
          : ((full.sessions || []).some((s: any) => {
              if (!s.isActive) return false;
              const created = new Date(s.createdAt).getTime();
              const now = Date.now();
              return now - created < 2 * 60 * 1000;
            }) ? 'online' : 'offline');
        return {
          id: full.id,
          login: full.login,
          link: full.link || null,
          avatar: full.avatar,
          role: full.role,
          status,
          backgroundUrl: full.backgroundUrl || null,
        };
      });
      // Attach lastMessage as a simple object (or null) and decrypt its text if present
      let lastMessage = Array.isArray(chat.messages) && chat.messages.length > 0 ? chat.messages[0] : null;
      if (lastMessage && typeof lastMessage.text === 'string') {
        try {
          lastMessage = { ...lastMessage, text: decryptMessage(lastMessage.text, chat.id) };
        } catch (e) {
          // if decryption fails, keep a placeholder
          lastMessage = { ...lastMessage, text: '[Ошибка шифрования]' };
        }
      }
      return { ...chat, users: usersWithStatus, lastMessage };
    });

    console.log('API /api/chats: found chats for user', user.id, chatsWithStatus);
    return res.status(200).json({ chats: chatsWithStatus });
  }

  return res.status(405).end();
}
