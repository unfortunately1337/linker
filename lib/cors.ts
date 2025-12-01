import { NextApiRequest, NextApiResponse } from 'next';

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
  'http://localhost:3001',
];

export function setCORSHeaders(req: NextApiRequest, res: NextApiResponse) {
  const origin = req.headers.origin || '';

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS'
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization'
    );
  }

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return true; // Request handled
  }

  return false;
}

export function safeError(error: any, isDev: boolean = false) {
  const message = error?.message || 'Internal Server Error';
  if (isDev) {
    return { error: message, stack: error?.stack };
  }
  return { error: 'Server error' };
}
