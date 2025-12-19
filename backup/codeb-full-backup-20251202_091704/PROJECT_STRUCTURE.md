# 📁 CodeB Server 프로젝트 구조

## 🏢 정리된 디렉토리 구조

```
codeb-server/ (Root)
├── 📄 FINAL_INTEGRATION_SYSTEM.md    ← 메인 통합 시스템 문서
├── 📄 .gitignore                     ← Git 설정
├── 📄 .mcp.json                      ← MCP 서버 설정
├── 📄 .DS_Store                      ← macOS 시스템 파일
│
├── 📁 api-servers/                   ← API 서버 모음
│   ├── codeb-api-server-v3.5.js     ← 최신 API 서버
│   ├── codeb-api-server.js           ← 메인 API 서버
│   └── codeb-platform-api.js         ← 플랫폼 API 서버
│
├── 📁 scripts/                       ← 실행 스크립트 모음
│   ├── unified-integration-script.js ← 통합 시스템 실행 스크립트
│   ├── verify-agents.sh             ← 에이전트 검증 스크립트
│   ├── codeb-cli-v2.sh              ← CLI v2 스크립트
│   ├── codeb-cli.sh                 ← 메인 CLI 스크립트
│   └── codeb-api-server.service     ← systemd 서비스 설정
│
├── 📁 deployment/                    ← 배포 관련 파일
│   ├── deploy-commerce.sh           ← 커머스 배포 스크립트
│   ├── deploy-simple.sh             ← 간단 배포 스크립트
│   ├── deploy-v35-api.sh            ← API v3.5 배포 스크립트
│   ├── setup-nginx.sh               ← Nginx 설정 스크립트
│   └── start-platform-api.sh        ← 플랫폼 API 시작 스크립트
│
├── 📁 web-ui/                        ← 웹 인터페이스
│   └── codeb-web-ui.html            ← 웹 UI 파일
│
├── 📁 docs/                          ← 문서 모음
│   ├── 📁 configs/                   ← 설정 파일들
│   │   ├── .env.production          ← 프로덕션 환경 설정
│   │   ├── Caddyfile                ← Caddy 웹서버 설정
│   │   ├── Caddyfile.http           ← HTTP 전용 Caddy 설정
│   │   ├── Caddyfile.simple         ← 간단 Caddy 설정
│   │   ├── nginx-config.conf        ← Nginx 설정
│   │   └── server.env               ← 서버 환경 변수
│   │
│   ├── 📄 CADDY_SETUP.md             ← Caddy 설정 가이드
│   ├── 📄 CLAUDE.md                  ← CodeB 시스템 메인 문서
│   ├── 📄 CLI_DOCUMENTATION.md       ← CLI 사용법 문서
│   ├── 📄 COMMERCE_DEPLOYMENT_MANUAL.md ← 커머스 배포 매뉴얼
│   ├── 📄 DEPLOYMENT_INSTRUCTIONS.md ← 배포 지침서
│   ├── 📄 INFRASTRUCTURE_STATUS.md   ← 인프라 상태 문서
│   ├── 📄 OPERATIONS_GUIDE.md        ← 운영 가이드
│   ├── 📄 PROJECT_CLONE_GUIDE.md     ← 프로젝트 복제 가이드
│   ├── 📄 SERVER_DEPLOYMENT_GUIDE.md ← 서버 배포 가이드
│   ├── 📄 STORAGE_CONFIGURATION.md  ← 스토리지 설정 문서
│   ├── 📄 SUCCESS_MANUAL.md          ← 성공 사례 매뉴얼
│   ├── 📄 TROUBLESHOOTING_GUIDE.md   ← 트러블슈팅 가이드
│   ├── 📄 UNIFIED_COMMAND_SYSTEM.md  ← 통합 명령어 시스템
│   ├── 📄 ai.md                      ← AI 관련 문서
│   ├── 📄 ai-index.md                ← AI 인덱스 문서
│   ├── 📄 ai-page-2.md               ← AI 페이지 2 문서
│   └── 📄 에이전트 단계.md            ← 에이전트 단계별 가이드
│
├── 📁 codeb-agent-1.0/               ← CodeB Agent 1.0 시스템
│   ├── 📄 README.md                  ← 49개 에이전트 시스템 문서
│   ├── 📄 CB_COMMANDS.md             ← /cb 명령어 시스템
│   ├── 📄 VERSION                    ← 버전 정보
│   ├── 📄 install.sh                 ← 설치 스크립트
│   ├── 📁 bin/                       ← 실행 파일
│   ├── 📁 scripts/                   ← 에이전트 실행 스크립트
│   ├── 📁 config/                    ← 설정 파일
│   ├── 📁 lib/                       ← 라이브러리
│   ├── 📁 docs/                      ← 상세 문서
│   ├── 📁 data/                      ← 데이터 저장소
│   └── 📁 tests/                     ← 테스트 파일
│
├── 📁 mcp-contest-continuity/        ← MCP Contest Continuity 서버
│   ├── 📄 README.md                  ← MCP 서버 문서 (11개 도구)
│   ├── 📄 MCP_INTEGRATION_GUIDE.md   ← MCP 통합 가이드
│   ├── 📄 package.json               ← Node.js 패키지 설정
│   ├── 📄 tsconfig.json              ← TypeScript 설정
│   ├── 📁 src/                       ← 소스 코드
│   │   ├── index.ts                 ← 메인 진입점
│   │   ├── 📁 lib/                   ← 핵심 라이브러리 (11개)
│   │   └── 📁 tools/                 ← MCP 도구 (11개)
│   ├── 📁 dist/                      ← 빌드 결과물
│   ├── 📁 tests/                     ← 테스트 파일
│   └── 📁 examples/                  ← 사용 예제
│
└── 📁 기존 프로젝트 디렉토리들/      ← 기존 폴더들 유지
    ├── codeb-cli/                   ← CLI 패키지
    ├── codeb-remix/                 ← Remix 애플리케이션
    ├── backup/                      ← 백업 파일
    ├── scripts/                     ← 추가 스크립트
    ├── starpick-platform/           ← Starpick 플랫폼
    ├── test-project/                ← 테스트 프로젝트
    └── vultr/                       ← Vultr 관련 파일
```

## 📋 주요 파일 역할

### **Root Level (최상위)**
- `FINAL_INTEGRATION_SYSTEM.md`: **59+ 에이전트 통합 시스템 메인 문서**
- `.mcp.json`: MCP 서버 설정 (Claude Code 연동)
- `.gitignore`: Git 무시 파일 설정

### **API Servers (`/api-servers/`)**
- `codeb-api-server-v3.5.js`: 최신 v3.5 API 서버
- `codeb-api-server.js`: 메인 API 서버 (55KB)
- `codeb-platform-api.js`: 플랫폼 전용 API 서버

### **Scripts (`/scripts/`)**
- `unified-integration-script.js`: **통합 시스템 실행 스크립트** (메인)
- `verify-agents.sh`: Claude Code 에이전트 검증
- `codeb-cli-v2.sh` & `codeb-cli.sh`: CLI 인터페이스

### **Documentation (`/docs/`)**
- `CLAUDE.md`: **CodeB 시스템 메인 문서** (8KB)
- `UNIFIED_COMMAND_SYSTEM.md`: **통합 명령어 시스템**
- `configs/`: 모든 설정 파일 (Caddy, Nginx, 환경변수)

### **CodeB Agent 1.0 (`/codeb-agent-1.0/`)**
- **49개 에이전트 시스템** (1 Orchestrator + 4 Domain Leads + 11 Specialists + 33 Workers)
- `/cb` 명령어 시스템 (7 배치로 실행)
- 성능 최적화: 코드 재사용 +52%, 의존성 감소 -36%

### **MCP Server (`/mcp-contest-continuity/`)**
- **11개 MCP 도구**: Context 영속화, Sub-Agent 위임, 패턴 라이브러리 등
- 무제한 sub-agent 생성 및 병렬 처리
- 실시간 모니터링 및 자동화

## 🎯 사용 방법

### **1. 시스템 시작**
```bash
# 루트에서 통합 시스템 실행
node scripts/unified-integration-script.js workflow existing optimization
```

### **2. 개별 구성 요소 사용**
```bash
# API 서버 시작
node api-servers/codeb-api-server-v3.5.js

# MCP 서버 시작  
cd mcp-contest-continuity && npm start

# CodeB Agent 1.0 사용
cd codeb-agent-1.0 && ./install.sh
```

### **3. 문서 참조**
- **시스템 개요**: `FINAL_INTEGRATION_SYSTEM.md`
- **세부 사용법**: `docs/CLAUDE.md`
- **명령어 체계**: `docs/UNIFIED_COMMAND_SYSTEM.md`

## 🚀 핵심 특징

1. **59+ 에이전트 시스템**: Claude Code 7개 + CodeB 49개 + MCP 무제한 sub-agents
2. **완벽한 정리**: 카테고리별 파일 구조화 완료
3. **통합 실행**: 단일 스크립트로 전체 시스템 구동
4. **모듈식 구조**: 각 구성 요소 독립 실행 가능
5. **확장성**: MCP를 통한 무제한 확장

---

**프로젝트가 완벽하게 정리되었습니다!** 🎉