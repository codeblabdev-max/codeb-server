# 재사용 가능한 프로젝트 개발 MCP 시스템

## 🎯 목표
- **신규 프로젝트 MCP**: 표준화된 새 프로젝트 생성
- **재사용 프로젝트 MCP**: 기존 프로젝트 분석 및 90% 재사용률 달성

## 📋 MCP 서버 구조

### 1. 신규 프로젝트 MCP (`mcp-new-project`)

#### 기능
- 프레임워크별 보일러플레이트 생성 (Next.js, Remix, React, Vue)
- 표준 개발환경 자동 설정
- 폴더구조 표준화
- 개발도구 통합 설정

#### 주요 도구
- `create_project`: 새 프로젝트 생성
- `setup_environment`: 개발환경 설정
- `add_template`: 템플릿 추가
- `configure_tools`: 개발도구 설정

### 2. 재사용 프로젝트 MCP (`mcp-reuse-project`)

#### 기능  
- 기존 프로젝트 패턴 분석
- 중복 코드 식별 및 제거
- 모듈화 가능 부분 식별
- 표준 패턴으로 리팩토링 제안

#### 주요 도구
- `analyze_project`: 프로젝트 구조 분석
- `detect_patterns`: 패턴 및 중복성 탐지
- `suggest_refactor`: 리팩토링 제안
- `modularize_code`: 모듈화 적용

## 🔧 전역 설치 및 사용

```bash
# 전역 설치
npm install -g mcp-new-project mcp-reuse-project

# 신규 프로젝트 생성
mcp-new-project create --framework nextjs --name my-app

# 기존 프로젝트 분석 및 최적화
mcp-reuse-project analyze ./existing-project
```

## 📊 90% 재사용률 달성 전략

### 패턴 분석 로직
1. **구조 분석**: 폴더/파일 패턴 식별
2. **중복성 탐지**: 유사 코드 블록 발견  
3. **의존성 분석**: 모듈간 관계 파악
4. **재사용성 평가**: 모듈별 재사용 가능성 점수

### 최적화 단계
1. **분석 단계**: 현재 상태 진단
2. **계획 단계**: 최적화 로드맵 제시
3. **실행 단계**: 자동 리팩토링 적용
4. **검증 단계**: 개선 결과 확인

## 🏗️ 공통 모듈 패턴 및 중복 방지 전략

### 핵심 원칙
- **DRY (Don't Repeat Yourself)**: 중복 코드 최소화
- **모듈화**: 기능별 독립적 모듈 구성
- **표준화**: 일관된 코딩 패턴 적용
- **재사용성**: 다양한 프로젝트에서 활용 가능

### 공통 모듈 구조
```
common-modules/
├── templates/          # 프레임워크별 템플릿
│   ├── nextjs/
│   ├── remix/
│   └── react/
├── patterns/           # 코드 패턴 라이브러리
│   ├── api-handlers/
│   ├── components/
│   └── utils/
├── configs/            # 설정 템플릿
│   ├── eslint/
│   ├── typescript/
│   └── tailwind/
└── analyzers/          # 분석 로직
    ├── pattern-matcher/
    ├── duplicate-detector/
    └── dependency-analyzer/
```

### 중복 탐지 알고리즘
1. **구문적 유사성**: AST 기반 코드 구조 비교
2. **의미적 유사성**: 함수 기능 및 목적 분석
3. **패턴 매칭**: 공통 디자인 패턴 식별
4. **의존성 분석**: 모듈 간 관계 및 재사용 가능성

### 자동 리팩토링 규칙
- **함수 추출**: 중복 로직을 공통 함수로 분리
- **컴포넌트 추상화**: UI 패턴을 재사용 가능한 컴포넌트로 변환
- **설정 통합**: 분산된 설정을 중앙화된 구성으로 통합
- **타입 정의**: 공통 타입을 별도 모듈로 분리

## 🔧 MCP 서버 기술 사양

### 1. 신규 프로젝트 MCP 상세 사양

#### 프로토콜 지원
- Model Context Protocol v1.0
- JSON-RPC 2.0 메시징
- 실시간 스트리밍 지원

#### 도구 명세
```typescript
interface CreateProjectTool {
  name: "create_project";
  description: "새로운 프로젝트 생성";
  inputSchema: {
    framework: "nextjs" | "remix" | "react" | "vue";
    name: string;
    template?: string;
    features?: string[];
  };
}
```

### 2. 재사용 프로젝트 MCP 상세 사양

#### 분석 엔진
- **정적 분석**: 코드 구조 및 패턴 분석
- **의존성 그래프**: 모듈 간 관계 시각화
- **메트릭 수집**: 코드 품질 및 복잡도 측정

#### 도구 명세
```typescript
interface AnalyzeProjectTool {
  name: "analyze_project";
  description: "프로젝트 구조 및 패턴 분석";
  inputSchema: {
    projectPath: string;
    analysisType: "full" | "structure" | "patterns" | "duplicates";
    outputFormat: "json" | "report" | "suggestions";
  };
}
```

## 📖 사용 시나리오 및 예제

### 시나리오 1: 레거시 프로젝트 현대화
```bash
# 1. 프로젝트 분석
mcp-reuse-project analyze ./legacy-app --type full

# 2. 리팩토링 제안 받기
mcp-reuse-project suggest-refactor ./legacy-app --target modern

# 3. 자동 모듈화 적용
mcp-reuse-project modularize ./legacy-app --pattern components
```

### 시나리오 2: 새 프로젝트에 기존 패턴 적용
```bash
# 1. 기존 프로젝트에서 패턴 추출
mcp-reuse-project extract-patterns ./existing-app --output ./patterns

# 2. 새 프로젝트 생성 시 패턴 적용
mcp-new-project create --framework nextjs --name new-app --patterns ./patterns
```

## 🚀 구현 로드맵

### Phase 1: 기초 인프라 (4주)
- [ ] MCP 프로토콜 기본 구현
- [ ] 프로젝트 구조 분석 엔진
- [ ] 기본 템플릿 라이브러리

### Phase 2: 분석 기능 (6주)
- [ ] AST 기반 코드 분석
- [ ] 중복 패턴 탐지 알고리즘
- [ ] 의존성 그래프 생성

### Phase 3: 자동화 기능 (8주)
- [ ] 자동 리팩토링 엔진
- [ ] 템플릿 생성 자동화
- [ ] 품질 메트릭 측정

### Phase 4: 통합 및 최적화 (4주)
- [ ] Claude Code 통합
- [ ] 성능 최적화
- [ ] 사용자 인터페이스 개선

## 🔍 컨텍스트 유지 기반 자동 문서화 시스템

### 핵심 개념
페이지/컴포넌트 생성 시점에서 **컨텍스트가 유지된 상태**이기 때문에, 관련 정보를 자동으로 문서화하여 나중에 활용할 수 있도록 기록

### 📝 자동 기록 항목

#### 1. UI 컴포넌트 생성 시
```markdown
## 테스트 항목 - LoginPage
- [ ] 로그인 폼 렌더링 확인
- [ ] 이메일 입력 필드 (.email-input)
- [ ] 비밀번호 입력 필드 (.password-input) 
- [ ] 로그인 버튼 클릭 (#login-btn)
- [ ] 유효성 검사 오류 표시
- [ ] 성공 시 대시보드 리다이렉트
```

#### 2. DB 테이블/쿼리 추가 시
```markdown
## DB 테스트 항목 - users 테이블
- [ ] 테이블 생성 확인
- [ ] 필수 컬럼 존재 확인 (id, email, password, created_at)
- [ ] 인덱스 생성 확인 (email 유니크)
- [ ] CRUD 쿼리 테스트
  - [ ] INSERT: 새 사용자 생성
  - [ ] SELECT: 이메일로 사용자 조회
  - [ ] UPDATE: 사용자 정보 수정
  - [ ] DELETE: 사용자 삭제
```

#### 3. API 엔드포인트 추가 시
```markdown
## API 테스트 항목 - /api/auth/login
- [ ] POST 요청 처리 확인
- [ ] 필수 파라미터 검증 (email, password)
- [ ] 성공 응답 (200, JWT 토큰)
- [ ] 실패 응답 (401, 에러 메시지)
- [ ] 요청 본문 유효성 검사
- [ ] CORS 헤더 확인
```

### 🤖 MCP 도구 구현

#### `record_test_items` 도구
- 코드 생성과 동시에 테스트 항목 문서화
- 클래스명, ID, 데이터 속성 자동 추출
- 관련 테스트 시나리오 템플릿 생성

#### `update_test_docs` 도구  
- 기존 테스트 문서에 새 항목 추가
- 중복 제거 및 관련 항목 그룹핑
- 우선순위 자동 설정

### 📋 테스트 문서 구조
```
project/
├── docs/
│   ├── test-items.md          # 전체 테스트 항목 목록
│   ├── ui-tests.md            # UI 컴포넌트 테스트
│   ├── api-tests.md           # API 엔드포인트 테스트
│   ├── db-tests.md            # 데이터베이스 테스트
│   └── integration-tests.md   # 통합 테스트 시나리오
```

### 💡 바이브 코딩 컨테스트 활용법

1. **개발 중**: MCP가 자동으로 테스트 항목 기록
2. **개발 완료 후**: 문서화된 테스트 항목 체크리스트로 활용
3. **다음 컨테스트**: 기존 패턴과 테스트 템플릿 재사용

## 🔄 컨테스트 Context 영속화 시스템

### 핵심 아이디어: "컨테스트가 계속 진행되는 것처럼"

컨테스트 중에 축적되는 **모든 context 정보**를 기록해서, 새 프로젝트 시작 시 **마치 컨테스트가 계속 이어지는 것처럼** 활용

### 📊 영속화할 Context 정보

#### 1. DB 구조 패턴
```json
{
  "dbPatterns": {
    "userAuth": {
      "tables": ["users", "sessions", "roles"],
      "relationships": ["users->sessions", "users->roles"],
      "commonQueries": ["login", "register", "logout"]
    },
    "ecommerce": {
      "tables": ["products", "orders", "cart_items"],
      "relationships": ["users->orders", "orders->cart_items"]
    }
  }
}
```

#### 2. 폴더 구조 템플릿
```json
{
  "folderStructures": {
    "nextjs-ecommerce": {
      "pages": ["/", "/products", "/cart", "/checkout"],
      "components": ["ProductCard", "CartItem", "CheckoutForm"],
      "api": ["/api/products", "/api/cart", "/api/orders"]
    }
  }
}
```

#### 3. API 패턴 라이브러리
```json
{
  "apiPatterns": {
    "CRUD": {
      "endpoints": ["GET /", "POST /", "PUT /:id", "DELETE /:id"],
      "validation": "joi/zod schemas",
      "errorHandling": "standardized responses"
    }
  }
}
```

### 🤖 MCP 도구: Context 수집 & 재사용

#### `capture_contest_context` 도구
- 현재 프로젝트의 모든 구조/패턴 스캔
- DB 스키마, 폴더 구조, API 엔드포인트 추출
- Context 데이터베이스에 저장

#### `resume_contest_context` 도구  
- 새 프로젝트 시작 시 기존 Context 로드
- 유사한 패턴 자동 제안
- **"컨테스트 연속성"** 제공

### 💡 실제 사용 시나리오

```bash
# 컨테스트 중 - Context 수집
mcp-contest capture-context ./current-project --type ecommerce

# 새 프로젝트 - Context 활용  
mcp-contest resume-context --pattern ecommerce --framework nextjs
# → DB 스키마, 폴더 구조, API 템플릿 자동 생성
# → "마치 컨테스트가 계속 진행되는 것처럼"
```

### 🎯 최종 효과
- **시간 단축**: 기본 구조 설정 5분 → 30초
- **일관성**: 검증된 패턴 재사용
- **품질**: 이전 컨테스트 경험 축적
- **연속성**: 프로젝트 간 Context 이어짐

---
**네비게이션**: [목차](./ai-index.md) | [페이지 2 ▶](./ai-page-2.md)  
**현재 페이지**: 1/2 (1-400줄) | **문서 상태**: 500줄 초과로 자동 분할됨
---

## ✅ 페이지 분할 완료!

**🎉 자동 페이지 분할이 완료되었습니다!**

- **페이지 1** (현재): 기본 MCP 시스템 (1-400줄)
- **페이지 2**: 고급 기능 - 버전 관리 및 문서 분할 시스템 (401-800줄) 
- **목차**: [ai-index.md](./ai-index.md)에서 전체 구조 확인

### 📊 분할 정보
- **원본 길이**: 570줄 
- **분할 기준**: 500줄 초과
- **분할 시점**: 400줄 (적절한 섹션 경계)
- **생성된 파일**: `ai-page-2.md`, `ai-index.md`

### 🔄 다음 단계
500줄을 다시 초과하면 **페이지 3**이 자동으로 생성됩니다.

---
**네비게이션**: [목차](./ai-index.md) | [페이지 2 ▶](./ai-page-2.md)  
**현재 페이지**: 1/2 (1-400줄)
---