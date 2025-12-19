# 🚀 CodeB 실제 작업 흐름 예시 - 소셜 로그인 구현

## 📌 실제 작업 흐름: "회원 로그인 + 소셜 로그인 구현"

### **사용자 요청**
```
"회원 로그인이랑 소셜 로그인(구글, 카카오, 네이버) 만들어줘"
```

## 🎯 Master Agent 작업 분석 및 분배

### **Step 1: Master Agent 요구사항 분석**
```typescript
// Master Agent가 요구사항을 분석하고 작업 계획 수립
const masterAnalysis = {
  feature: "인증 시스템 구현",
  components: [
    "일반 로그인 (이메일/비밀번호)",
    "소셜 로그인 (구글, 카카오, 네이버)",
    "회원가입 프로세스",
    "비밀번호 찾기",
    "세션 관리"
  ],
  
  // 각 에이전트에게 할당할 작업 정의
  taskDistribution: {
    backend: {
      priority: 1,
      tasks: [
        "인증 API 엔드포인트 설계",
        "OAuth 2.0 통합",
        "JWT 토큰 관리",
        "세션 처리"
      ]
    },
    database: {
      priority: 1,
      tasks: [
        "users 테이블 설계",
        "social_accounts 테이블",
        "sessions 테이블",
        "인덱스 최적화"
      ]
    },
    frontend: {
      priority: 2,
      tasks: [
        "로그인 폼 컴포넌트",
        "소셜 로그인 버튼",
        "회원가입 페이지",
        "반응형 디자인"
      ]
    },
    testing: {
      priority: 3,
      tasks: [
        "로그인 플로우 E2E 테스트",
        "소셜 로그인 테스트",
        "보안 테스트",
        "성능 테스트"
      ]
    }
  }
};
```

### **Step 2: Master가 6개 에이전트에게 동시 작업 지시**

```typescript
// Master가 Claude Code Task Tool로 병렬 실행
async function executeLoginFeature() {
  console.log("🚀 [Master] 소셜 로그인 기능 개발 시작");
  
  // 6개 에이전트 동시 실행
  const results = await Promise.all([
    // 1. Backend Agent 실행
    Task.spawn({
      agent: "backend-agent",
      instruction: `
        다음 API 엔드포인트를 구현하세요:
        - POST /api/auth/login (일반 로그인)
        - POST /api/auth/register (회원가입)
        - GET /api/auth/google (구글 OAuth)
        - GET /api/auth/kakao (카카오 OAuth)
        - GET /api/auth/naver (네이버 OAuth)
        - POST /api/auth/refresh (토큰 갱신)
        - POST /api/auth/logout (로그아웃)
        
        JWT 토큰 기반, refresh token 구현 필수
      `
    }),
    
    // 2. Database Agent 실행
    Task.spawn({
      agent: "database-agent",
      instruction: `
        다음 테이블을 설계하세요:
        
        users 테이블:
        - id (UUID, PK)
        - email (unique)
        - password (bcrypt hashed, nullable for social)
        - name
        - profile_image
        - created_at, updated_at
        
        social_accounts 테이블:
        - user_id (FK)
        - provider (google/kakao/naver)
        - provider_id
        - access_token
        - refresh_token
        
        세션 관리와 인덱스 최적화 포함
      `
    }),
    
    // 3. Frontend Agent 실행
    Task.spawn({
      agent: "frontend-agent",
      instruction: `
        다음 UI 컴포넌트를 구현하세요:
        
        1. LoginForm 컴포넌트
           - 이메일/비밀번호 입력
           - 유효성 검사
           - 에러 메시지 표시
        
        2. SocialLoginButtons 컴포넌트
           - 구글 로그인 버튼
           - 카카오 로그인 버튼 (노란색)
           - 네이버 로그인 버튼 (초록색)
        
        3. 반응형 디자인 (모바일/PC)
        4. 로딩 상태 및 에러 처리
      `
    }),
    
    // 4. E2E Test Agent 실행
    Task.spawn({
      agent: "test-agent",
      instruction: `
        다음 테스트 시나리오를 작성하세요:
        
        1. 일반 로그인 플로우
           - 정상 로그인
           - 잘못된 비밀번호
           - 존재하지 않는 이메일
        
        2. 소셜 로그인 플로우
           - 구글 OAuth 플로우
           - 카카오 OAuth 플로우
           - 네이버 OAuth 플로우
        
        3. 보안 테스트
           - SQL Injection 방어
           - XSS 방어
           - Rate limiting
      `
    }),
    
    // 5. Admin Panel Agent 실행
    Task.spawn({
      agent: "admin-agent",
      instruction: `
        관리자 대시보드에 다음 기능 추가:
        
        1. 사용자 관리
           - 전체 사용자 목록
           - 소셜 로그인 사용자 구분
           - 계정 활성화/비활성화
        
        2. 로그인 통계
           - 일별 로그인 수
           - 소셜 로그인 비율
           - 실패한 로그인 시도
      `
    }),
    
    // 6. DevOps Agent 실행
    Task.spawn({
      agent: "devops-agent",
      instruction: `
        다음 설정을 구성하세요:
        
        1. 환경 변수 설정
           - OAuth 클라이언트 ID/Secret
           - JWT Secret
           - Session Secret
        
        2. Docker 설정
           - Redis for sessions
           - PostgreSQL 설정
        
        3. CI/CD 파이프라인
           - 테스트 자동화
           - 배포 자동화
      `
    })
  ]);
  
  return results;
}
```

## 📊 실시간 진행 상황 (한국어 보고)

### **병렬 실행 중 상태 보고**
```
⏱️ 00:00 - 작업 시작
🔄 [Backend] API 엔드포인트 설계 중... (10%)
🔄 [Database] 테이블 스키마 설계 중... (15%)
🔄 [Frontend] 로그인 폼 컴포넌트 작성 중... (5%)
🔄 [Test] 테스트 시나리오 작성 중... (5%)
🔄 [Admin] 관리자 페이지 설계 중... (10%)
🔄 [DevOps] 환경 설정 구성 중... (20%)

⏱️ 00:05 - 5분 경과
🔄 [Backend] OAuth 통합 구현 중... (45%)
✅ [Database] 테이블 생성 완료! (100%)
🔄 [Frontend] 소셜 로그인 버튼 구현 중... (40%)
🔄 [Test] E2E 테스트 작성 중... (30%)
🔄 [Admin] 사용자 관리 UI 구현 중... (35%)
✅ [DevOps] Docker 설정 완료! (100%)

⏱️ 00:15 - 15분 경과
✅ [Backend] 모든 API 구현 완료! (100%)
✅ [Database] 인덱스 최적화 완료! (100%)
🔄 [Frontend] 반응형 디자인 적용 중... (85%)
🔄 [Test] 보안 테스트 실행 중... (70%)
✅ [Admin] 관리 기능 구현 완료! (100%)
✅ [DevOps] CI/CD 파이프라인 구성 완료! (100%)

⏱️ 00:20 - 완료
✅ 모든 에이전트 작업 완료!
```

## 🔗 Master Agent 통합 작업

### **Step 3: Master가 결과물 통합 및 검증**

```typescript
// Master Agent가 모든 결과물을 통합
async function integrateResults(agentResults) {
  console.log("🔧 [Master] 결과물 통합 시작");
  
  // 1. API와 Frontend 연결 확인
  const apiIntegration = validateAPIIntegration(
    agentResults.backend,
    agentResults.frontend
  );
  
  // 2. Database와 Backend 연동 확인
  const dbIntegration = validateDatabaseIntegration(
    agentResults.database,
    agentResults.backend
  );
  
  // 3. 전체 테스트 실행
  const testResults = await runIntegrationTests(
    agentResults.testing,
    {
      api: agentResults.backend,
      ui: agentResults.frontend,
      db: agentResults.database
    }
  );
  
  // 4. 최종 검증
  return {
    success: testResults.passed,
    deliverables: {
      api: {
        endpoints: 7,
        authentication: "JWT + OAuth 2.0",
        providers: ["google", "kakao", "naver"]
      },
      database: {
        tables: 3,
        indexes: 5,
        constraints: "완벽"
      },
      frontend: {
        components: 5,
        responsive: true,
        accessibility: "WCAG 2.1 AA"
      },
      testing: {
        coverage: "92%",
        e2e_tests: 15,
        security_tests: 8
      },
      deployment: {
        docker: "ready",
        ci_cd: "configured",
        environments: ["dev", "staging", "prod"]
      }
    }
  };
}
```

## 💡 실제 구현 코드 예시

### **Backend Agent 결과물 - Express.js API**
```javascript
// routes/auth.js
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// 일반 로그인
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: '사용자를 찾을 수 없습니다' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다' });
    }
    
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      success: true,
      token,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (error) {
    res.status(500).json({ error: '서버 오류가 발생했습니다' });
  }
});

// 구글 OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

router.get('/google/callback', 
  passport.authenticate('google', { session: false }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/login/success?token=${token}`);
  }
);

// 카카오 OAuth
router.get('/kakao', passport.authenticate('kakao'));

router.get('/kakao/callback',
  passport.authenticate('kakao', { session: false }),
  (req, res) => {
    const token = generateToken(req.user);
    res.redirect(`${process.env.CLIENT_URL}/login/success?token=${token}`);
  }
);
```

### **Frontend Agent 결과물 - React 컴포넌트**
```tsx
// components/LoginForm.tsx
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { SocialLoginButtons } from './SocialLoginButtons';

export const LoginForm = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, error } = useAuth();
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      await login({ email, password });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full space-y-8">
        <h2 className="text-3xl font-bold text-center">로그인</h2>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="이메일"
            className="w-full px-4 py-3 border rounded-lg"
            required
          />
          
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="비밀번호"
            className="w-full px-4 py-3 border rounded-lg"
            required
          />
          
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">또는</span>
          </div>
        </div>
        
        <SocialLoginButtons />
      </div>
    </div>
  );
};

// components/SocialLoginButtons.tsx
export const SocialLoginButtons = () => {
  return (
    <div className="space-y-3">
      <button
        onClick={() => window.location.href = '/api/auth/google'}
        className="w-full flex items-center justify-center px-4 py-3 border rounded-lg hover:bg-gray-50"
      >
        <img src="/google-icon.svg" className="w-5 h-5 mr-2" />
        구글로 로그인
      </button>
      
      <button
        onClick={() => window.location.href = '/api/auth/kakao'}
        className="w-full flex items-center justify-center px-4 py-3 bg-yellow-400 rounded-lg hover:bg-yellow-500"
      >
        <img src="/kakao-icon.svg" className="w-5 h-5 mr-2" />
        카카오로 로그인
      </button>
      
      <button
        onClick={() => window.location.href = '/api/auth/naver'}
        className="w-full flex items-center justify-center px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600"
      >
        <img src="/naver-icon.svg" className="w-5 h-5 mr-2" />
        네이버로 로그인
      </button>
    </div>
  );
};
```

### **Database Agent 결과물 - PostgreSQL 스키마**
```sql
-- users 테이블
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255), -- NULL for social login users
    name VARCHAR(100) NOT NULL,
    profile_image VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- social_accounts 테이블
CREATE TABLE social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'google', 'kakao', 'naver'
    provider_id VARCHAR(255) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_id)
);

-- sessions 테이블
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    refresh_token VARCHAR(500) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 인덱스 생성
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_provider ON social_accounts(provider, provider_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_refresh_token ON sessions(refresh_token);
```

### **Test Agent 결과물 - Playwright E2E 테스트**
```typescript
// tests/auth.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('일반 로그인 성공', async ({ page }) => {
    await page.goto('/login');
    
    // 이메일과 비밀번호 입력
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    // 로그인 버튼 클릭
    await page.click('button[type="submit"]');
    
    // 대시보드로 리다이렉트 확인
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('text=환영합니다')).toBeVisible();
  });
  
  test('구글 소셜 로그인', async ({ page }) => {
    await page.goto('/login');
    
    // 구글 로그인 버튼 클릭
    await page.click('button:has-text("구글로 로그인")');
    
    // OAuth 플로우 처리 (모의)
    await page.waitForURL(/google\.com/);
    // ... Google OAuth 처리
    
    // 성공 후 리다이렉트
    await expect(page).toHaveURL('/dashboard');
  });
  
  test('잘못된 비밀번호 처리', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // 에러 메시지 확인
    await expect(page.locator('text=비밀번호가 일치하지 않습니다')).toBeVisible();
  });
});
```

## 📈 최종 결과 보고서

```yaml
프로젝트: 소셜 로그인 시스템 구현
총 소요 시간: 20분
병렬 처리 효율: 95%

구현 완료 항목:
  Backend:
    - ✅ 7개 API 엔드포인트
    - ✅ JWT 인증 시스템
    - ✅ OAuth 2.0 통합 (구글, 카카오, 네이버)
    
  Database:
    - ✅ 3개 테이블 (users, social_accounts, sessions)
    - ✅ 5개 인덱스 최적화
    - ✅ 외래키 제약조건
    
  Frontend:
    - ✅ 로그인 폼 컴포넌트
    - ✅ 소셜 로그인 버튼 (3개 플랫폼)
    - ✅ 반응형 디자인 (모바일/PC)
    - ✅ 에러 처리 및 로딩 상태
    
  Testing:
    - ✅ 15개 E2E 테스트
    - ✅ 92% 코드 커버리지
    - ✅ 보안 테스트 통과
    
  Admin:
    - ✅ 사용자 관리 대시보드
    - ✅ 로그인 통계 시각화
    
  DevOps:
    - ✅ Docker 컨테이너 설정
    - ✅ CI/CD 파이프라인
    - ✅ 환경 변수 관리

품질 메트릭:
  - 응답 시간: <200ms
  - 보안 등급: A+
  - 접근성: WCAG 2.1 AA
  - 성능 점수: 95/100
```

## 🎯 핵심 포인트

### **Master Agent의 역할**
1. **요구사항 분석**: 사용자 요청을 구체적 작업으로 분해
2. **작업 분배**: 각 에이전트에게 명확한 지시사항 전달
3. **병렬 조율**: 6개 에이전트 동시 실행 관리
4. **통합 검증**: 결과물 통합 및 품질 확인
5. **최종 보고**: 한국어로 완료 상태 보고

### **실제 병렬 처리의 장점**
- **시간 단축**: 순차 처리 대비 7배 빠름
- **전문성 활용**: 각 에이전트가 자신의 전문 영역에 집중
- **품질 향상**: 동시에 여러 관점에서 검증
- **실시간 피드백**: 진행 상황 즉시 확인 가능

이것이 CodeB 7-Agent System의 실제 작동 방식입니다!