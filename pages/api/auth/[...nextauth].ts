
import NextAuth from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { loginLimiter, twoFALimiter } from "../../../lib/rateLimiter";

import prisma from "../../../lib/prisma";
import { createSession, deactivateOtherSessions } from "../../../lib/sessions";

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
    credentials: {
  login: { label: "Login", type: "text" },
  password: { label: "Password", type: "password" },
  twoFactorCode: { label: "2FA Code", type: "text", optional: true }
    },
      async authorize(credentials, req) {
        if (!credentials?.login || !credentials?.password) {
          console.log('[AUTH] Missing credentials');
          return null;
        }
        const user = await prisma.user.findUnique({ where: { login: credentials.login } });
        if (!user) {
          console.log('[AUTH] User not found');
          return null;
        }
        // Сравниваем хэш пароля
        const bcrypt = require('bcryptjs');
        const valid = await bcrypt.compare(credentials.password, user.password);
        if (!valid) {
          console.log('[AUTH] Invalid password');
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
        
        // Create a new session in PostgreSQL
        const newSession = await createSession(user.id, deviceName, ip);
        
        // Deactivate all other sessions for this user
        await deactivateOtherSessions(user.id, newSession.id);
        
        // Return user with sessionId
  return { 
    id: user.id, 
    name: user.login, 
    role: (user as any).role, 
    avatar: (user as any).avatar,
    sessionId: newSession.id
  };
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
        token.role = (user as any).role;
        token.avatar = (user as any).avatar;
        if ((user as any).sessionId) token.sessionId = (user as any).sessionId;
        return token;
      }
      return token;
    },
    async session({ session, token }: { session: any, token: any }) {
      if (token && session.user) {
        session.user.id = token.id;
        session.user.name = token.name;
        session.user.role = token.role;
        session.user.avatar = token.avatar;
        session.user.sessionId = token.sessionId;
      }
      return session;
    }
  }
};

// Wrap NextAuth with rate limiters
const authHandler = NextAuth(authOptions);

export default async (req: any, res: any) => {
  // Apply rate limiting to login attempts
  if (req.method === 'POST' && req.url?.includes('/callback/credentials')) {
    return loginLimiter(req, res, () => authHandler(req, res));
  }
  return authHandler(req, res);
};