import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Rutas que NO requieren autenticación (exactas o por prefijo) */
const PUBLIC_EXACT = new Set(['/', '/explore']);
const PUBLIC_PREFIXES = ['/login', '/invite', '/explore/', '/api/'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
  if (isPublic) return NextResponse.next();

  // Comprobar presencia del access_token (validación real en el layout via /api/auth/me)
  const accessToken = request.cookies.get('access_token');
  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Excluir assets estáticos y rutas Next.js internas
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
