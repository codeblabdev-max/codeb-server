/**
 * CodeB Authentication System
 * JWT 기반 사용자 인증
 */

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// 환경변수에서 시크릿 키 로드
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'codeb-super-secret-key-change-in-production'
);

const COOKIE_NAME = 'codeb-auth-token';

// 사용자 타입
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'developer' | 'viewer';
  createdAt: string;
}

// JWT 페이로드
export interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

// 기본 사용자 (프로덕션에서는 DB 사용)
const DEFAULT_USERS: Record<string, { password: string; user: User }> = {
  'admin@codeb.dev': {
    password: 'admin123!', // 프로덕션에서는 해시 사용
    user: {
      id: 'user-1',
      email: 'admin@codeb.dev',
      name: 'Admin',
      role: 'admin',
      createdAt: '2024-01-01T00:00:00Z',
    },
  },
  'dev@codeb.dev': {
    password: 'dev123!',
    user: {
      id: 'user-2',
      email: 'dev@codeb.dev',
      name: 'Developer',
      role: 'developer',
      createdAt: '2024-01-01T00:00:00Z',
    },
  },
};

/**
 * JWT 토큰 생성
 */
export async function createToken(user: User): Promise<string> {
  const token = await new SignJWT({
    userId: user.id,
    email: user.email,
    role: user.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);

  return token;
}

/**
 * JWT 토큰 검증
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as JWTPayload;
  } catch {
    return null;
  }
}

/**
 * 로그인
 */
export async function login(
  email: string,
  password: string
): Promise<{ success: boolean; token?: string; user?: User; error?: string }> {
  const userRecord = DEFAULT_USERS[email];

  if (!userRecord) {
    return { success: false, error: 'User not found' };
  }

  if (userRecord.password !== password) {
    return { success: false, error: 'Invalid password' };
  }

  const token = await createToken(userRecord.user);

  return {
    success: true,
    token,
    user: userRecord.user,
  };
}

/**
 * 쿠키에서 현재 사용자 가져오기
 */
export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // 사용자 정보 반환
  const userRecord = DEFAULT_USERS[payload.email];
  return userRecord?.user || null;
}

/**
 * 인증 미들웨어
 */
export async function authMiddleware(
  request: NextRequest
): Promise<NextResponse | null> {
  // 공개 경로
  const publicPaths = ['/login', '/api/auth/login', '/api/health'];
  const pathname = request.nextUrl.pathname;

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return null; // 인증 불필요
  }

  // API 요청
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    return null; // 인증 성공
  }

  // 페이지 요청
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return null; // 인증 성공
}

/**
 * 권한 체크
 */
export function hasPermission(
  user: User,
  requiredRole: 'admin' | 'developer' | 'viewer'
): boolean {
  const roleHierarchy = { admin: 3, developer: 2, viewer: 1 };
  return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
}

/**
 * API 키 검증 (서버 간 통신용)
 */
export function verifyApiKey(apiKey: string): boolean {
  const validKeys = (process.env.API_KEYS || 'codeb-api-key-1,codeb-api-key-2').split(',');
  return validKeys.includes(apiKey);
}
