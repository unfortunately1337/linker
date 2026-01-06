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
  console.log('[API] /api/chats: authenticated user request');
  if (!session || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'POST') {
    const { name, userIds, avatarUrl } = req.body;
    console.log('[API] /api/chats POST request:', { name, userIds, avatarUrl, currentUserId: user.id });
    
    // Название может быть null для 1:1 чатов
    if (name !== null && name !== undefined && (typeof name !== 'string' || !name.trim())) {
      return res.status(400).json({ error: 'Название должно быть строкой или null' });
    }
    // Гарантируем, что текущий пользователь всегда в группе
    let allUserIds = Array.isArray(userIds) ? [...userIds] : [];
    if (!allUserIds.includes(user.id)) {
      allUserIds.push(user.id);
    }
    console.log('[API] Final userIds for chat:', allUserIds);
    
    if (allUserIds.length < 2) {
      return res.status(400).json({ error: 'Минимум 2 участника' });
    }
    // Создать чат и добавить пользователей
    const chat = await prisma.chat.create({
      data: {
        name: name || null, // null for 1:1 chats
        avatarUrl: avatarUrl || null,
        users: {
          connect: allUserIds.map((id: string) => ({ id }))
        }
      },
      include: { 
        users: {
          select: {
            id: true,
            login: true,
            link: true,
            avatar: true,
            role: true
          }
        }
      }
    });
    console.log('[API] Created chat:', { id: chat.id, name: chat.name, users: chat.users.length });
    return res.status(200).json({ chat });
  }

  if (req.method === 'GET') {
    const { chatId, userIds } = req.query;
    
    // If chatId is provided, fetch that specific chat
    if (chatId && typeof chatId === 'string') {
      console.log('[API] /api/chats GET with chatId:', chatId, 'userId:', user.id);
      const chat = await prisma.chat.findFirst({
        where: {
          id: chatId,
          users: { some: { id: user.id } } // Verify user is in this chat
        },
        include: {
          users: {
            select: {
              id: true,
              login: true,
              link: true,
              avatar: true,
              role: true
            }
          }
        }
      });
      if (!chat) {
        console.log('[API] Chat not found for id:', chatId, 'user:', user.id);
        return res.status(404).json({ error: 'Chat not found or access denied' });
      }
      
      // Check if user is blocked in 1:1 chat (in both directions)
      let isUserBlocked = false;  // When OTHER user blocked THIS user
      let userBlockedContact = false;  // When THIS user blocked OTHER user
      
      if (chat.users.length === 2) {
        const otherUser = chat.users.find((u: any) => u.id !== user.id);
        if (otherUser) {
          // Check if the other user blocked this user
          const blockRecord = await prisma.blockedUser.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: otherUser.id,
                blockedId: user.id
              }
            }
          });
          isUserBlocked = !!blockRecord;
          
          // Check if this user blocked the other user
          const userBlockRecord = await prisma.blockedUser.findUnique({
            where: {
              blockerId_blockedId: {
                blockerId: user.id,
                blockedId: otherUser.id
              }
            }
          });
          userBlockedContact = !!userBlockRecord;
        }
      }
      
      console.log('[API] Chat found:', { id: chat.id, name: chat.name, users: chat.users.length, isUserBlocked, userBlockedContact, backgroundUrl: chat.backgroundUrl });
      return res.status(200).json({ chat, isUserBlocked, userBlockedContact, backgroundUrl: chat.backgroundUrl });
    }
    
    if (userIds && typeof userIds === 'string') {
      const ids = userIds.split(',').map(s => s.trim()).filter(Boolean);
      console.log('[API] /api/chats GET with userIds:', ids);
      if (ids.length === 2) {
          // Ищем личный чат между двумя пользователями
          let chat = await prisma.chat.findFirst({
            where: {
              AND: [
                { name: null }, // Only 1:1 chats (without name)
                { users: { every: { id: { in: ids } } } }
              ]
            },
            include: { 
              users: {
                select: {
                  id: true,
                  login: true,
                  link: true,
                  avatar: true,
                  role: true
                }
              }
            }
          });
          // Дополнительно проверяем, что в чате ровно два пользователя
          if (chat && chat.users.length !== 2) {
            console.log('[API] Found chat but user count mismatch:', chat.users.length);
            chat = null;
          }
          
          let isUserBlocked = false;
          if (chat) {
            console.log('[API] 1:1 chat found:', { id: chat.id, users: chat.users.length });
            const otherUser = chat.users.find((u: any) => u.id !== user.id);
            if (otherUser) {
              const blockRecord = await prisma.blockedUser.findUnique({
                where: {
                  blockerId_blockedId: {
                    blockerId: otherUser.id,
                    blockedId: user.id
                  }
                }
              });
              isUserBlocked = !!blockRecord;
            }
          } else {
            console.log('[API] No 1:1 chat found for users:', ids);
          }
          // Return what we found (or null if nothing) - don't auto-create
          return res.status(200).json({ chat: chat || null, isUserBlocked });
      }
    }
    // Получить все чаты пользователя
    // Fetch chats and include users (with sessions) and the latest message to avoid N+1 queries
    const chats = await prisma.chat.findMany({
      where: { users: { some: { id: user.id } } },
      select: {
        id: true,
        name: true,
        avatarUrl: true,
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

  if (req.method === 'PATCH') {
    const { chatId, name, avatarUrl } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ error: 'chatId is required' });
    }
    
    // Verify user is in this chat
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        users: { some: { id: user.id } }
      }
    });
    
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }
    
    // Update chat
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;
    
    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: updateData,
      include: {
        users: {
          select: {
            id: true,
            login: true,
            link: true,
            avatar: true,
            role: true
          }
        }
      }
    });
    
    return res.status(200).json({ chat: updatedChat });
  }

  if (req.method === 'DELETE') {
    const { chatId } = req.body;
    
    if (!chatId || typeof chatId !== 'string') {
      return res.status(400).json({ error: 'chatId is required' });
    }

    // Verify user is in this chat
    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        users: { some: { id: user.id } }
      }
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found or access denied' });
    }

    // Only allow deleting group chats (with name)
    if (!chat.name) {
      return res.status(400).json({ error: 'Cannot delete 1:1 chats' });
    }

    // Delete all messages in the chat first
    await prisma.message.deleteMany({
      where: { chatId }
    });

    // Delete the chat
    await prisma.chat.delete({
      where: { id: chatId }
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).end();
}
