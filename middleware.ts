import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

function addSecurityHeaders(response: NextResponse) {
  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // XSS Protection
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // HSTS (Force HTTPS, 1 year)
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );

  // Referrer Policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // CSP Header
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://js.pusher.com wss://ws.pusher.com; " +
    "frame-ancestors 'none'"
  );

  // Permissions Policy
  response.headers.set(
    'Permissions-Policy',
    'geolocation=(), payment=()'
  );

  return response;
}

export async function middleware(request: NextRequest) {
  try {
    const path = request.nextUrl.pathname;

    // Allow auth pages so unauthenticated users can sign in / register
    if (path === '/auth/login' || path === '/auth/register') {
      const response = NextResponse.next();
      return addSecurityHeaders(response);
    }

    // Allow public and Next.js internal assets (matcher excludes many, but keep safe)
    if (path.startsWith('/_next') || path.startsWith('/api') || path.startsWith('/public') || path === '/favicon.ico') {
      return NextResponse.next();
    }

    // Use next-auth jwt helper to read token from cookie or authorization header
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      // Not authenticated — redirect to login (no returnTo param to keep URL clean)
      const loginUrl = new URL('/auth/login', request.nextUrl.origin);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated — allow
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  } catch (e) {
    console.error('[MIDDLEWARE] Authentication error');
    const response = NextResponse.next();
    return addSecurityHeaders(response);
  }
}

export const config = {
  matcher: [
    '/((?!_next|api|favicon.ico|public|styles|generated|prisma|dotnet-frontend).*)',
  ],
};
