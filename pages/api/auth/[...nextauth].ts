
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { loginLimiter, twoFALimiter } from "../../../lib/rateLimiter";

import prisma from "../../../lib/prisma";
import { createSession, deactivateOtherSessions, deactivateAllUserSessions } from "../../../lib/sessions";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        login: { label: "Login", type: "text" },
        password: { label: "Password", type: "password" },
        twoFactorCode: { label: "2FA Code", type: "text", optional: true },
        isAccessKey: { label: "Is Access Key", type: "text", optional: true },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.login || !credentials?.password) {
            console.log('[AUTH] Missing credentials');
            return null;
          }          // Check if this is access key login
          const isAccessKeyLogin = credentials.isAccessKey === 'true';

          if (isAccessKeyLogin) {
            // Access key login - verify the code directly
            const user = await prisma.user.findUnique({ 
              where: { login: credentials.login }
            });
            
            if (!user) {
              console.log('[AUTH] User not found:', credentials.login);
              return null;
            }

            // Fetch access keys separately
            const accessKeys = await (prisma as any).accessKey.findMany({
              where: { userId: user.id }
            });

            // Check if the code matches any access key
            const validKey = accessKeys.find((key: any) => key.code === credentials.password);
            if (!validKey) {
              console.log('[AUTH] Invalid access key code for user:', credentials.login);
              return null;
            }

            // Update last used timestamp
            await (prisma as any).accessKey.update({
              where: { id: validKey.id },
              data: { lastUsedAt: new Date() },
            });

            // Create session
            let deviceName = req.headers?.['user-agent'] || 'Unknown Device';
            let ip: string | undefined = (req.headers?.['x-forwarded-for'] as string);
            const userAgent = req.headers?.['user-agent'] as string | undefined;
            const newSession = await createSession(user.id, deviceName, ip, userAgent, true);
            await deactivateOtherSessions(user.id, newSession.id);

            console.log('[AUTH] User authenticated via access key:', credentials.login);
            return { 
              id: user.id, 
              name: user.login, 
              role: (user as any).role, 
              avatar: (user as any).avatar,
              sessionId: newSession.id
            };
          }

          // Regular password login
          const user = await prisma.user.findUnique({ where: { login: credentials.login } });
          if (!user) {
            console.log('[AUTH] User not found:', credentials.login);
            return null;
          }
          // Сравниваем хэш пароля
          const bcrypt = require('bcryptjs');
          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) {
            console.log('[AUTH] Invalid password for user:', credentials.login);
            return null;
          }
          // Если у пользователя включена 2FA — проверяем TOTP код
          if (user.twoFactorEnabled) {
            const speakeasy = require('speakeasy');
            if (!credentials?.twoFactorCode) {
              console.log('[AUTH] 2FA code required');
              return null;
            }
            const verified = speakeasy.totp.verify({
              secret: user.twoFactorSecret || '',
              encoding: 'base32',
              token: credentials.twoFactorCode,
              window: 1
            });
            if (!verified) {
              console.log('[AUTH] Invalid 2FA code');
              return null;
            }
          }
          
          // Extract device info and IP
          let deviceName = req.headers?.['user-agent'] || 'Unknown Device';
          let ip: string | undefined = (req.headers?.['x-forwarded-for'] as string);
          const userAgent = req.headers?.['user-agent'] as string | undefined;
          
          // Create a new session in PostgreSQL
          const newSession = await createSession(user.id, deviceName, ip, userAgent, true);
          
          // Deactivate all other sessions for this user
          await deactivateOtherSessions(user.id, newSession.id);
          
          console.log('[AUTH] User authenticated successfully:', credentials.login);
          
          // Return user with sessionId
          return { 
            id: user.id, 
            name: user.login, 
            role: (user as any).role, 
            avatar: (user as any).avatar,
            sessionId: newSession.id
          };
        } catch (err) {
          console.error('[AUTH] Authorization error:', err);
          return null;
        }
      }
    })
  ],
  session: {
    strategy: 'jwt' as const,
    // session max age in seconds (30 days)
    maxAge: 60 * 60 * 24 * 30,
    // updateAge: time in seconds to refresh token periodically (e.g., 24 hours)
    updateAge: 60 * 60 * 24,
  },
  jwt: {
    // when using JWT strategy, set jwt maxAge as well (30 days)
    maxAge: 60 * 60 * 24 * 30,
  },
  cookies: {
    sessionToken: {
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        secure: process.env.NEXTAUTH_URL?.startsWith('https') ?? false,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      }
    }
  },
  secret: process.env.NEXTAUTH_SECRET || "dev-secret",
  callbacks: {
    async jwt({ token, user }: { token: any, user?: any }) {
      // On sign in, attach user fields including sessionId
      if (user) {
        token.id = user.id;
        token.name = user.name;
        token.login = user.name; // Store login as well (user.name is the login)
        token.role = (user as any).role;
        token.avatar = (user as any).avatar;
        if ((user as any).sessionId) token.sessionId = (user as any).sessionId;
      }
      
      // Ensure login is always set from name (backward compatibility)
      if (!token.login && token.name) {
        token.login = token.name;
      }
      
      return token;
    },
    async session({ session, token }: { session: any, token: any }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.name = token.name;
        // Ensure login is set from token.login or token.name
        session.user.login = token.login || token.name;
        session.user.role = token.role;
        session.user.avatar = token.avatar;
        session.user.sessionId = token.sessionId;
      }
      return session;
    },
    async signOut({ token }: { token: any }) {
      // End all sessions for the user when they sign out
      if (token?.id) {
        try {
          const count = await deactivateAllUserSessions(token.id);
          console.log('[AUTH] All sessions ended for user:', token.id, 'Count:', count);
        } catch (err) {
          console.error('[AUTH] Error ending sessions on signout:', err);
        }
      }
      return true;
    }
  }
};

// Wrap NextAuth with rate limiters
const authHandler = NextAuth(authOptions);

export default async (req: any, res: any) => {
  // Only apply rate limiting to credentials login attempts
  if (req.method === 'POST' && req.url?.includes('/callback/credentials')) {
    try {
      // Use promise wrapper to ensure callback is always called
      return new Promise<void>((resolve) => {
        loginLimiter(req, res, () => {
          authHandler(req, res);
          resolve();
        });
      });
    } catch (err) {
      console.error('[AUTH] Rate limiter error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
  return authHandler(req, res);
};