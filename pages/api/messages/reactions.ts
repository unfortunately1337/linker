import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import prisma from '../../../lib/prisma';

// In-memory store for reactions (fallback)
const reactionsStore: Record<string, Record<string, string[]>> = {};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session || !session.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = session.user.id as string;

  if (req.method === 'POST') {
    // Add or remove a reaction
    const { messageId, emoji } = req.body || {};
    
    if (!messageId || typeof messageId !== 'string' || !emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: 'messageId and emoji required' });
    }

    try {
      // Try to use database first
      try {
        const existingReaction = await prisma.reaction.findUnique({
          where: { messageId_userId_emoji: { messageId, userId, emoji } }
        });

        if (existingReaction) {
          await prisma.reaction.delete({ where: { id: existingReaction.id } });
          console.log('[REACTION] Deleted:', { messageId, userId, emoji });
        } else {
          await prisma.reaction.create({
            data: { messageId, userId, emoji }
          });
          console.log('[REACTION] Created:', { messageId, userId, emoji });
        }

        // Get all reactions for this message
        const reactions = await prisma.reaction.groupBy({
          by: ['emoji'],
          where: { messageId },
          _count: { id: true }
        });

        const reactionsWithUsers = await Promise.all(
          reactions.map(async (reaction) => {
            const users = await prisma.reaction.findMany({
              where: { messageId, emoji: reaction.emoji },
              select: { user: { select: { id: true, login: true, avatar: true } } }
            });
            return {
              emoji: reaction.emoji,
              count: reaction._count.id,
              userIds: users.map(r => r.user.id),
              users: users.map(r => r.user)
            };
          })
        );

        console.log('[REACTION] Response:', { messageId, reactions: reactionsWithUsers });
        return res.status(200).json({ messageId, reactions: reactionsWithUsers });
      } catch (dbErr) {
        // Fallback to in-memory if DB fails
        console.warn('[REACTIONS] DB error, using in-memory store:', dbErr);
        
        if (!reactionsStore[messageId]) {
          reactionsStore[messageId] = {};
        }

        if (!reactionsStore[messageId][emoji]) {
          reactionsStore[messageId][emoji] = [];
        }

        const index = reactionsStore[messageId][emoji].indexOf(userId);
        if (index > -1) {
          reactionsStore[messageId][emoji].splice(index, 1);
          if (reactionsStore[messageId][emoji].length === 0) {
            delete reactionsStore[messageId][emoji];
          }
        } else {
          reactionsStore[messageId][emoji].push(userId);
        }

        const reactions = Object.entries(reactionsStore[messageId] || {}).map(([e, users]) => ({
          emoji: e,
          count: users.length,
          userIds: users
        }));

        console.log('[REACTION] In-memory response:', { messageId, reactions });
        return res.status(200).json({ messageId, reactions });
      }
    } catch (error) {
      console.error('[REACTIONS] Error:', error);
      return res.status(500).json({ error: 'Failed to update reaction' });
    }
  }

  if (req.method === 'GET') {
    const { messageId } = req.query;

    if (!messageId || typeof messageId !== 'string') {
      return res.status(400).json({ error: 'messageId required' });
    }

    try {
      try {
        const reactions = await prisma.reaction.groupBy({
          by: ['emoji'],
          where: { messageId },
          _count: { id: true }
        });

        console.log('[REACTION GET] Found reactions:', reactions);

        const reactionsWithUsers = await Promise.all(
          reactions.map(async (reaction) => {
            const users = await prisma.reaction.findMany({
              where: { messageId, emoji: reaction.emoji },
              select: { user: { select: { id: true, login: true, avatar: true } } }
            });
            return {
              emoji: reaction.emoji,
              count: reaction._count.id,
              userIds: users.map(r => r.user.id),
              users: users.map(r => r.user)
            };
          })
        );

        console.log('[REACTION GET] Response:', { messageId, reactions: reactionsWithUsers });
        return res.status(200).json({ reactions: reactionsWithUsers });
      } catch (dbErr) {
        // Fallback to in-memory
        console.warn('[REACTIONS GET] DB error, using in-memory:', dbErr);
        const reactions = Object.entries(reactionsStore[messageId] || {}).map(([emoji, userIds]) => ({
          emoji,
          count: userIds.length,
          userIds
        }));
        return res.status(200).json({ reactions });
      }
    } catch (error) {
      console.error('[REACTIONS GET] Error:', error);
      return res.status(500).json({ error: 'Failed to get reactions' });
    }
  }

  res.status(405).json({ error: 'Method not allowed' });
}
