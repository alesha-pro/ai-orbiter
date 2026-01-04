import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  const origin = request.headers.get('origin');

  const allowedHosts = ['localhost', '127.0.0.1'];
  
  // Check Host header
  const isHostAllowed = allowedHosts.some(allowed => 
    host === allowed || host?.split(':')[0] === allowed
  );

  if (!isHostAllowed) {
    return new NextResponse('Access Denied: Local access only', { status: 403 });
  }

  // Check Origin header if present (for CSRF protection)
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const isOriginAllowed = allowedHosts.includes(originUrl.hostname);
      if (!isOriginAllowed) {
        return new NextResponse('Access Denied: Invalid Origin', { status: 403 });
      }
    } catch (e) {
      return new NextResponse('Access Denied: Malformed Origin', { status: 400 });
    }
  }

  return NextResponse.next();
}

// Apply to all routes except static assets and internal next files
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
