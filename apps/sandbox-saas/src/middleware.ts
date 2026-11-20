import { NextResponse, type NextRequest } from 'next/server';
import { updateSupabaseSession } from '@/lib/supabase/middleware';

const PROTECTED_PAGES = ['/guardian'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { response, user } = await updateSupabaseSession(request);

  const isProtectedPage = PROTECTED_PAGES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  // Mandatory authentication for Mission Control (/guardian)
  if (isProtectedPage && !user) {
    const authUrl = new URL('/auth', request.url);
    authUrl.searchParams.set('next', pathname);
    authUrl.searchParams.set('required', '1');
    return NextResponse.redirect(authUrl);
  }

  // Already authenticated operator visiting /auth -> enter Mission Control directly
  if (pathname === '/auth' && user) {
    const nextParam = request.nextUrl.searchParams.get('next');
    const safeNext = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/guardian';
    return NextResponse.redirect(new URL(safeNext, request.url));
  }

  return response;
}

export const config = {
  matcher: ['/guardian/:path*', '/auth'],
};
