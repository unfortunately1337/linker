import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma";
import { publishUserEvent } from '../../../lib/realtime';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { friendId } = req.body as { friendId?: string };
  const session = (await getServerSession(req, res, authOptions as any)) as any;
  if (!session || !session.user || !(session.user as any).id) return res.status(401).json({ error: 'Unauthorized' });
  const userId = (session.user as any).id;
  if (!friendId) return res.status(400).json({ error: "friendId required" });
  // Prevent sending friend request to yourself
  if (friendId === userId) return res.status(400).json({ error: "Cannot send friend request to yourself" });
  // Ensure target user exists
  const targetUser = await prisma.user.findUnique({ where: { id: friendId }, select: { id: true } });
  if (!targetUser) return res.status(404).json({ error: "Target user not found" });
  // Проверка на существование заявки
  const existing = await prisma.friendRequest.findFirst({ where: { fromId: userId, toId: friendId } });
  if (existing) return res.status(400).json({ error: "Заявка уже отправлена." });
  // Проверка на уже существующую дружбу (either direction)
  const alreadyFriend = await prisma.friend.findFirst({ where: { OR: [ { userId: userId, friendId }, { userId: friendId, friendId: userId } ] } });
  if (alreadyFriend) return res.status(400).json({ error: "Вы уже в друзьях" });
  const created = await prisma.friendRequest.create({ data: { fromId: userId, toId: friendId } });

  // Try to fetch sender info for notification
  try {
    const fromUser = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, login: true, link: true, avatar: true } });
    if (fromUser) {
      // Trigger SSE/Pusher event to the recipient's user channel (include link)
      try {
        await publishUserEvent(friendId, 'friend-request', { fromId: fromUser.id, fromLogin: fromUser.login, fromLink: fromUser.link || null, fromAvatar: fromUser.avatar || null });
      } catch (e) {
        // log but don't fail the request
        console.error('Error publishing friend-request:', e);
      }
    }
  } catch (e) {
    console.error('Failed to fetch sender user for friend request notification:', e);
  }

  return res.status(200).json({ ok: true, request: created });
}
