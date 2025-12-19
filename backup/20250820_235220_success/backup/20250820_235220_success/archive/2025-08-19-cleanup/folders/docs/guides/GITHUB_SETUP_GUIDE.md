# 🔐 GitHub 설정 가이드

Claude Code에서 GitHub CLI 및 MCP GitHub 서버를 설정하는 완전 가이드

## 📋 필요한 설정

### 1. GitHub CLI 인증 설정

#### GitHub CLI 인증 방법
```bash
# 웹 브라우저를 통한 인증 (권장)
gh auth login --web

# 토큰을 직접 입력하는 방법
gh auth login --with-token < token.txt
```

#### 인증 상태 확인
```bash
# 현재 인증 상태 확인
gh auth status

# 인증된 사용자 정보 확인
gh api user
```

### 2. Personal Access Token 생성

#### 필요한 권한 (Scopes)
- **repo**: 전체 저장소 접근
- **workflow**: GitHub Actions 관리
- **write:packages**: 패키지 게시
- **read:org**: 조직 정보 읽기
- **admin:repo_hook**: 웹훅 관리

#### 토큰 생성 단계
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" 클릭
3. 필요한 권한 선택
4. 토큰 복사 및 안전하게 보관

### 3. MCP GitHub 서버 설정

#### 환경 변수 설정
```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# 즉시 적용
source ~/.zshrc
```

#### Claude Code MCP 설정 확인
```bash
# MCP 서버 상태 확인
claude config mcp list

# GitHub MCP 서버 테스트
claude mcp test github
```

## 🚀 설정 검증

### GitHub CLI 테스트
```bash
# 저장소 목록 확인
gh repo list

# 이슈 목록 확인  
gh issue list --repo owner/repo

# 풀 리퀘스트 목록 확인
gh pr list --repo owner/repo
```

### MCP GitHub 서버 테스트
```bash
# Claude Code에서 다음 명령어로 테스트
# 저장소 검색
mcp__github__search_repositories({
  "query": "language:typescript",
  "perPage": 5
})

# 사용자 정보 확인
mcp__github__get_user({
  "username": "your-username"
})
```

## 🔧 문제 해결

### 일반적인 문제

#### 1. "Authentication Failed: Bad credentials"
**원인**: Personal Access Token이 설정되지 않았거나 만료됨
**해결**:
```bash
# 새 토큰 생성 후 환경 변수 업데이트
export GITHUB_TOKEN="새_토큰"
source ~/.zshrc
```

#### 2. GitHub CLI 인증 실패
**원인**: 네트워크 또는 토큰 권한 문제
**해결**:
```bash
# 기존 인증 정보 삭제
gh auth logout

# 재인증
gh auth login --web
```

#### 3. MCP 서버 연결 실패
**원인**: Claude Code MCP 설정 문제
**해결**:
1. Claude Code 재시작
2. MCP 설정 파일 확인
3. 토큰 권한 재확인

### 권한 관련 문제

#### 조직 저장소 접근 불가
**해결**: 조직에서 Personal Access Token 승인 필요
1. 조직 Settings → Third-party access
2. Personal access tokens 섹션에서 토큰 승인

#### API 요청 제한 도달
**해결**: 요청 빈도 조절 또는 GitHub Pro 계정 사용

## 🔐 보안 모범 사례

### 토큰 관리
1. **최소 권한 원칙**: 필요한 권한만 부여
2. **정기적 갱신**: 90일마다 토큰 재생성
3. **안전한 저장**: 환경 변수 또는 키체인 사용
4. **접근 기록 모니터링**: GitHub에서 토큰 사용 기록 확인

### 환경별 토큰 분리
```bash
# 개발 환경
export GITHUB_TOKEN_DEV="ghp_dev_xxxxxxxxxxxx"

# 프로덕션 환경
export GITHUB_TOKEN_PROD="ghp_prod_xxxxxxxxxxxx"

# 현재 환경에 따라 토큰 선택
export GITHUB_TOKEN=$GITHUB_TOKEN_DEV
```

## 📝 설정 완료 체크리스트

- [ ] GitHub CLI 설치됨 (`gh version` 확인)
- [ ] GitHub CLI 인증 완료 (`gh auth status` 확인)
- [ ] Personal Access Token 생성됨
- [ ] 환경 변수 `GITHUB_TOKEN` 설정됨
- [ ] MCP GitHub 서버 테스트 성공
- [ ] 기본 Git 설정 완료
- [ ] 저장소 접근 권한 확인됨

## 🎯 다음 단계

설정이 완료되면:
1. **프로젝트 구조 정리**: Monorepo 구조 설정
2. **CI/CD 파이프라인**: GitHub Actions 워크플로우 구축
3. **시크릿 관리**: Repository secrets 설정
4. **자동화 구현**: 배포 및 관리 자동화

---

**작성일**: 2025-08-15  
**업데이트**: 진행 중  
**담당**: Claude Code Team