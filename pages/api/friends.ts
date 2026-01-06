import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';
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
  console.log('[FRIENDS API] User request - authenticated:', !!user, 'userId:', user?.id);
  if (!session || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const userId = user.id;

  // Получаем связи друзей
  const friends = await prisma.friend.findMany({ where: { userId } });
  console.log('[FRIENDS API] Friends from DB:', friends.length, friends);
  
  const friendIds = friends.map((f: { friendId: string }) => f.friendId);
  console.log('[FRIENDS API] Friend IDs:', friendIds);
  
  // Получаем пользователей-друзей с полной информацией
  const friendUsers = await prisma.user.findMany({
    where: { id: { in: friendIds } },
    select: {
      id: true,
      login: true,
      link: true,
      avatar: true,
      role: true
    }
  });

  console.log('[FRIENDS API] Friend users:', friendUsers.length, friendUsers);

  res.status(200).json({
    friends: friendUsers
  });
}
