/**
 * CodeB Middleware
 * API Key 및 JWT 인증 처리
 *
 * Edge Runtime 호환 - fs 사용 불가
 * API Keys는 환경변수 API_KEYS (쉼표 구분) 또는
 * /api/auth/verify에서 config 파일 체크
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Load API keys from environment variable
 * Format: API_KEYS="key1,key2,key3"
 */
function loadApiKeys(): string[] {
  const envKeys = process.env.API_KEYS || '';
  return envKeys.split(',').filter((k) => k.trim().length > 0);
}

// API Key 검증
function verifyApiKey(apiKey: string): boolean {
  const validKeys = loadApiKeys();

  // 환경변수에 키가 있으면 체크
  if (validKeys.length > 0) {
    return validKeys.includes(apiKey);
  }

  // 환경변수가 비어있으면 codeb_ prefix 키 허용 (config 파일은 API route에서 체크)
  if (apiKey.startsWith('codeb_admin_') || apiKey.startsWith('codeb_dev_') || apiKey.startsWith('codeb_view_')) {
    return true; // 실제 검증은 API route에서 수행
  }

  return false;
}

// JWT 검증 (간단한 형식 체크, 실제 검증은 route에서)
function isValidJwtFormat(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 공개 경로 - 인증 불필요
  const publicPaths = ['/login', '/api/auth/login', '/api/health', '/api/realtime', '/_next', '/favicon.ico'];

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // API 요청 인증
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');

    if (!authHeader) {
      return NextResponse.json({ success: false, error: 'Authorization header required' }, { status: 401 });
    }

    // Bearer 토큰 (JWT 또는 API Key)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);

      // API Key 체크
      if (verifyApiKey(token)) {
        // API Key 인증 성공 - 요청에 role 추가
        const response = NextResponse.next();
        response.headers.set('x-auth-type', 'api-key');
        response.headers.set('x-api-key', token);
        return response;
      }

      // JWT 형식 체크 (실제 검증은 route에서)
      if (isValidJwtFormat(token)) {
        const response = NextResponse.next();
        response.headers.set('x-auth-type', 'jwt');
        return response;
      }

      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 });
    }

    // API Key 헤더 (x-api-key)
    const apiKey = request.headers.get('x-api-key');
    if (apiKey && verifyApiKey(apiKey)) {
      const response = NextResponse.next();
      response.headers.set('x-auth-type', 'api-key');
      response.headers.set('x-api-key', apiKey);
      return response;
    }

    return NextResponse.json({ success: false, error: 'Invalid authorization format' }, { status: 401 });
  }

  // 페이지 요청 - 쿠키 인증
  const token = request.cookies.get('codeb-auth-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // JWT 형식 체크
  if (!isValidJwtFormat(token)) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // API 라우트
    '/api/:path*',
    // 페이지 (정적 파일 제외)
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
