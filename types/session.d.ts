import type { NextApiRequest } from 'next';
import 'iron-session';

declare module 'iron-session' {
  interface IronSessionData {
    webauthnChallenge?: string;
    webauthnKeyName?: string;
    webauthnBackupCode?: string;
    userId?: string;
  }
}

declare global {
  namespace Express {
    interface Request {
      session?: Record<string, any>;
    }
  }
}

declare module 'next' {
  interface NextApiRequest {
    session?: Record<string, any>;
  }
}
