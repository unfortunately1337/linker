import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../lib/prisma";
import { pusher } from "../../lib/pusher";
import { getServerSession } from 'next-auth/next';
import { authOptions } from './auth/[...nextauth]';
import { getUserSessions } from '../../lib/sessions';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    try {
      let userId = req.query.userId;
      let login = req.query.login;

      if (Array.isArray(userId)) userId = userId[0];
      if (Array.isArray(login)) login = login[0];

      let user;

      if (userId && typeof userId === "string") {
        user = await prisma.user.findUnique({
          where: { id: userId },
          include: {
            friends: true,
            sessions: true,
          },
        });
      } else if (login && typeof login === "string") {
        user = await prisma.user.findUnique({
          where: { login },
          include: {
            friends: true,
            sessions: true,
          },
        });
      } else {
        return res.status(400).json({ error: "userId or login required" });
      }

      const friendsFull = await Promise.all(
        (user?.friends || []).map(async (fr: any) => {
          try {
            const friend = await prisma.user.findUnique({
              where: { id: fr.friendId },
            });

            if (friend) {
              try {
                (friend as any).sessions = await getUserSessions(friend.id);
              } catch (sessionErr) {
                console.error(`[PROFILE] Failed to get sessions for friend ${friend.id}:`, sessionErr);
                (friend as any).sessions = [];
              }
            }
            if (!friend) return null;

            const savedF = (friend as any).status;
            const allowedF = ['online', 'offline', 'dnd'];

            const friendSessions = ((friend as any).sessions || []);

            const friendStatus =
              (typeof savedF === 'string' && allowedF.includes(savedF))
                ? savedF
                : (friendSessions.some((s: any) => {
                    if (!s.isActive) return false;
                    const created = new Date(s.createdAt).getTime();
                    const now = Date.now();
                    return now - created < 2 * 60 * 1000;
                  }) ? 'online' : 'offline');

            return {
              id: friend.id,
              login: friend.login,
              link: friend.link || null,
              avatar: friend.avatar,
              role: friend.role,
              status: friendStatus,
            };
          } catch (err) {
            console.error(`[PROFILE] Error processing friend ${fr.friendId}:`, err);
            return null;
          }
        })
      );

      const incomingRequests = await prisma.friendRequest.findMany({
        where: { toId: user?.id }
      });

      const friendRequests = await Promise.all(
        incomingRequests.map(async (req: any) => {
          const fromUser = await prisma.user.findUnique({
            where: { id: req.fromId },
          });

          if (fromUser) {
            (fromUser as any).sessions = await getUserSessions(fromUser.id);
          }

          const fSessions = (fromUser ? (fromUser as any).sessions || [] : []);

          return fromUser
            ? {
                id: fromUser.id,
                login: fromUser.login,
                link: fromUser.link || null,
                avatar: fromUser.avatar,
                role: fromUser.role,
                isOnline: fSessions.some((s: any) => {
                  if (!s.isActive) return false;
                  const created = new Date(s.createdAt).getTime();
                  const now = Date.now();
                  return now - created < 2 * 60 * 1000;
                })
              }
            : null;
        })
      );

      if (!user) return res.status(404).json({ error: "User not found" });

      const saved = (user as any).status;
      const allowed = ['online', 'offline', 'dnd'];
      const userSessions = ((user as any).sessions || []).filter((s: any) => s.isActive);
      
      console.log('[PROFILE API] User sessions:', userSessions.length, 'sessions found');

      const mainStatus =
        (typeof saved === 'string' && allowed.includes(saved))
          ? saved
          : (userSessions.some((s: any) => {
              if (!s.isActive) return false;
              const created = new Date(s.createdAt).getTime();
              const now = Date.now();
              return now - created < 2 * 60 * 1000;
            })
            ? 'online'
            : 'offline');

      const safeUser = {
        id: (user as any).id,
        login: (user as any).login,
        twoFactorEnabled: (user as any).twoFactorEnabled || false,
        link: (user as any).link || null,
        avatar: (user as any).avatar || null,
        role: (user as any).role || null,
        description: (user as any).description || null,
        backgroundUrl: (user as any).backgroundUrl || null,
        bgOpacity: (user as any).bgOpacity ?? null,
        favoriteTrackUrl: (user as any).favoriteTrackUrl ?? null,
        createdAt: (user as any).createdAt,
        status: mainStatus,
        firstLoginDone: (user as any).firstLoginDone || false,
        sessions: userSessions,
        friends: friendsFull.filter(Boolean),
        friendRequests: friendRequests.filter(Boolean)
      };

      return res.status(200).json({ user: safeUser });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Internal server error" });
    }
  }

  if (req.method === "POST") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;

    if (!session || !session.user || !(session.user as any).id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserId = (session.user as any).id;

    const {
      description,
      avatar,
      password,
      backgroundUrl,
      bgOpacity,
      favoriteTrackUrl,
      status
    } = req.body;

    try {
      const data: any = {};

      if (typeof description !== "undefined") data.description = description;
      if (typeof avatar === "string") data.avatar = avatar;

      if (typeof backgroundUrl === "string" || backgroundUrl === null)
        data.backgroundUrl = backgroundUrl;

      if (typeof bgOpacity === "number") data.bgOpacity = bgOpacity;

      if (typeof favoriteTrackUrl === "string" || favoriteTrackUrl === null)
        data.favoriteTrackUrl = favoriteTrackUrl;

      if (typeof status === 'string') {
        const allowed = ['online', 'offline', 'dnd'];
        if (allowed.includes(status)) data.status = status;
      }

      if (typeof password === "string" && password.length > 0) {
        const { forbiddenPasswords } =
          require('../../lib/forbidden-passwords');

        if (forbiddenPasswords.includes(password)) {
          return res.status(400).json({
            error: "Слишком простой пароль",
            code: "FORBIDDEN_PASSWORD"
          });
        }

        const bcrypt = require('bcryptjs');
        data.password = await bcrypt.hash(password, 8);
      }

      let prevStatus: string | null = null;

      if (typeof data.status !== 'undefined') {
        const prev = await prisma.user.findUnique({
          where: { id: currentUserId }
        }) as any;

        prevStatus = prev?.status || null;
      }

      const user = await prisma.user.update({
        where: { id: currentUserId },
        data,
      });

      try {
        if (typeof data.status !== 'undefined') {
          const newStatus = (user as any).status || null;

          if (newStatus !== prevStatus) {
            try {
              await pusher.trigger(
                `user-${currentUserId}`,
                'status-changed',
                { userId: currentUserId, status: newStatus }
              );
            } catch (pErr) {
              console.error('[PROFILE] Failed to trigger pusher status-changed:', String(pErr));
            }
          }
        }
      } catch (bErr) {
        console.error('[PROFILE] Broadcast error:', String(bErr));
      }

      const returnedUser = {
        id: (user as any).id,
        login: (user as any).login,
        twoFactorEnabled: (user as any).twoFactorEnabled || false,
        link: (user as any).link || null,
        avatar: (user as any).avatar || null,
        role: (user as any).role || null,
        description: (user as any).description || null,
        backgroundUrl: (user as any).backgroundUrl || null,
        bgOpacity: (user as any).bgOpacity ?? null,
        favoriteTrackUrl: (user as any).favoriteTrackUrl ?? null,
        createdAt: (user as any).createdAt,
      };

      return res.status(200).json({ user: returnedUser });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Internal server error" });
    }
  }

  if (req.method === "PATCH") {
    const session = (await getServerSession(req, res, authOptions as any)) as any;

    if (!session || !session.user || !(session.user as any).id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const currentUserId = (session.user as any).id;
    const { firstLoginDone } = req.body;

    try {
      const data: any = {};

      if (typeof firstLoginDone === "boolean") {
        data.firstLoginDone = firstLoginDone;
      }

      const user = await prisma.user.update({
        where: { id: currentUserId },
        data,
      });

      const returnedUser = {
        id: (user as any).id,
        login: (user as any).login,
        twoFactorEnabled: (user as any).twoFactorEnabled || false,
        link: (user as any).link || null,
        avatar: (user as any).avatar || null,
        role: (user as any).role || null,
        description: (user as any).description || null,
        backgroundUrl: (user as any).backgroundUrl || null,
        createdAt: (user as any).createdAt,
        firstLoginDone: (user as any).firstLoginDone,
      };

      return res.status(200).json({ user: returnedUser });
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "Internal server error" });
    }
  }

  return res.status(405).end();
}