# 🚀 Git 최적화 및 프로젝트 관리 전략

Claude Code와 MCP GitHub 서버를 활용한 효율적인 Git 워크플로우 구축 가이드

## 📊 현재 상태 분석

### Git 환경
- **Git 버전**: 2.39.5 (Apple Git-154)
- **설정 상태**: 초기 설정 필요
- **GitHub CLI**: 인증 필요
- **MCP GitHub**: 인증 설정 필요

### 문제점 식별
1. **프로젝트 관리 분산**: 여러 프로젝트의 체계적 관리 부족
2. **배포 문제**: 수동 배포로 인한 비효율성
3. **라이브 코딩 이슈**: 실시간 문제 해결 어려움
4. **권한 관리**: 시크릿 및 보안 설정 미흡

---

## 🎯 Git 최적화 전략

### 1. Git 기본 설정 최적화

#### 전역 설정
```bash
# 사용자 정보 설정
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# 기본 브랜치 설정
git config --global init.defaultBranch main

# 자동 색상 설정
git config --global color.ui auto

# 줄바꿈 설정 (macOS/Linux)
git config --global core.autocrlf input

# 푸시 전략 설정
git config --global push.default simple

# 자동 스테이징 설정
git config --global rebase.autoStash true
```

#### 고급 설정
```bash
# 성능 최적화
git config --global core.preloadindex true
git config --global core.fscache true
git config --global gc.auto 256

# 대용량 파일 처리
git config --global filter.lfs.clean "git-lfs clean -- %f"
git config --global filter.lfs.smudge "git-lfs smudge -- %f"
git config --global filter.lfs.process "git-lfs filter-process"
git config --global filter.lfs.required true

# 커밋 템플릿 설정
git config --global commit.template ~/.gitmessage
```

### 2. 브랜치 전략 최적화

#### Git Flow 기반 전략
```
main (production)     ←── 프로덕션 배포
├── develop           ←── 개발 통합
├── feature/*         ←── 기능 개발
├── release/*         ←── 릴리스 준비
└── hotfix/*          ←── 긴급 수정
```

#### 브랜치 명명 규칙
```bash
# 기능 개발
feature/user-authentication
feature/payment-gateway
feature/dashboard-ui

# 버그 수정
bugfix/login-validation
bugfix/api-timeout

# 긴급 수정
hotfix/security-patch
hotfix/critical-bug

# 릴리스
release/v1.2.0
release/v2.0.0-beta
```

### 3. 커밋 메시지 최적화

#### 커밋 메시지 템플릿 (`~/.gitmessage`)
```
# <type>(<scope>): <subject>
#
# <body>
#
# <footer>

# Type: feat, fix, docs, style, refactor, test, chore
# Scope: component, module, or file being changed
# Subject: imperative, present tense, lowercase, no period
# Body: explain what and why vs. how
# Footer: reference issues, breaking changes

# Examples:
# feat(auth): add OAuth2 login integration
# fix(api): resolve timeout issues in user endpoint  
# docs(readme): update installation instructions
# 🤖 Generated with Claude Code
```

#### 자동 커밋 훅 설정
```bash
# 커밋 메시지 검증
cat > .git/hooks/commit-msg << 'EOF'
#!/bin/bash
commit_regex='^(feat|fix|docs|style|refactor|test|chore)(\(.+\))?: .{1,50}'
if ! grep -qE "$commit_regex" "$1"; then
    echo "Invalid commit message format!"
    echo "Format: type(scope): description"
    exit 1
fi
EOF

chmod +x .git/hooks/commit-msg
```

---

## 🏗️ 프로젝트 구조 최적화

### 1. Monorepo vs Multi-repo 전략

#### Monorepo 구조 (권장)
```
workspace/
├── packages/
│   ├── frontend/           # React/Vue 앱
│   ├── backend/            # API 서버
│   ├── shared/             # 공통 라이브러리
│   └── infrastructure/     # Terraform/배포
├── tools/
│   ├── scripts/            # 빌드/배포 스크립트
│   └── configs/            # 공통 설정
├── docs/                   # 문서
└── .github/
    ├── workflows/          # CI/CD
    └── templates/          # 이슈/PR 템플릿
```

### 2. .gitignore 최적화

#### 통합 .gitignore
```gitignore
# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE
.vscode/
.idea/
*.swp
*.swo

# Dependencies
node_modules/
vendor/
*.lock

# Build outputs
dist/
build/
out/
target/

# Environment variables
.env
.env.local
.env.production
.env.staging

# Logs
*.log
logs/

# Database
*.db
*.sqlite

# Secrets
secrets/
*.pem
*.key
config/secrets.yaml

# Terraform
*.tfstate
*.tfstate.*
*.tfplan
terraform.tfvars

# Docker
docker-compose.override.yml

# OS specific
*.tmp
*.temp
```

---

## 🔐 GitHub Secret 및 권한 관리

### 1. Personal Access Token 설정

#### 권한 스코프
```yaml
required_scopes:
  - repo (전체 저장소 접근)
  - workflow (GitHub Actions)
  - write:packages (패키지 게시)
  - read:org (조직 읽기)
  - admin:repo_hook (웹훅 관리)
```

#### 환경별 토큰 관리
```bash
# 개발 환경
export GITHUB_TOKEN_DEV="ghp_xxxxxxxxxxxxxxxxxxxx"

# 스테이징 환경  
export GITHUB_TOKEN_STAGING="ghp_yyyyyyyyyyyyyyyyyyyy"

# 프로덕션 환경
export GITHUB_TOKEN_PROD="ghp_zzzzzzzzzzzzzzzzzzzz"
```

### 2. Repository Secrets 관리

#### 필수 시크릿
```yaml
secrets:
  # Cloud Provider
  VULTR_API_KEY: "AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"
  AWS_ACCESS_KEY_ID: "AKIA..."
  AWS_SECRET_ACCESS_KEY: "..."
  
  # Database
  DATABASE_URL: "postgresql://..."
  REDIS_URL: "redis://..."
  
  # API Keys
  STRIPE_SECRET_KEY: "sk_..."
  SENDGRID_API_KEY: "SG..."
  
  # SSH Keys
  DEPLOY_SSH_KEY: "-----BEGIN OPENSSH PRIVATE KEY-----"
  
  # Monitoring
  SENTRY_DSN: "https://..."
  DATADOG_API_KEY: "..."
```

#### 환경별 시크릿 구조
```yaml
environments:
  development:
    DATABASE_URL: "postgresql://dev..."
    API_BASE_URL: "https://api-dev.example.com"
    
  staging:
    DATABASE_URL: "postgresql://staging..."
    API_BASE_URL: "https://api-staging.example.com"
    
  production:
    DATABASE_URL: "postgresql://prod..."
    API_BASE_URL: "https://api.example.com"
```

---

## 🚀 Claude Code 통합 최적화

### 1. MCP GitHub 서버 설정

#### 인증 설정
```bash
# GitHub Personal Access Token 설정
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxx"

# Claude Code에서 MCP GitHub 서버 활성화
# ~/.claude/config.json 또는 settings에서 MCP 설정
```

#### MCP GitHub 활용 패턴
```javascript
// 저장소 검색
mcp__github__search_repositories({
  query: "org:your-org language:typescript",
  perPage: 20
});

// 이슈 생성
mcp__github__create_issue({
  owner: "your-org",
  repo: "project-name", 
  title: "Bug: Login validation error",
  body: "Description of the issue...",
  labels: ["bug", "high-priority"]
});

// 풀 리퀘스트 생성
mcp__github__create_pull_request({
  owner: "your-org",
  repo: "project-name",
  title: "feat(auth): add OAuth2 integration",
  head: "feature/oauth2-integration",
  base: "develop",
  body: "## Summary\n- Add OAuth2 login\n- Update user model"
});
```

### 2. 라이브 코딩 문제 해결 전략

#### 실시간 디버깅 워크플로우
```yaml
live_coding_workflow:
  1. 문제_발생:
     - Claude Code에서 즉시 진단
     - 관련 로그/에러 분석
     
  2. 신속_분석:
     - MCP GitHub로 관련 이슈 검색
     - 유사 문제 해결 사례 참조
     
  3. 해결_실행:
     - 임시 브랜치 생성
     - 실시간 코드 수정
     - 즉시 테스트 실행
     
  4. 검증_배포:
     - 자동 테스트 실행
     - PR 생성 및 리뷰
     - 긴급 배포 (필요시)
```

#### 핫픽스 자동화
```bash
#!/bin/bash
# hotfix-deploy.sh

# 현재 브랜치에서 핫픽스 브랜치 생성
git checkout -b hotfix/$(date +%Y%m%d-%H%M%S)

# 변경사항 커밋
git add .
git commit -m "hotfix: $(git log -1 --pretty=%B | head -1)"

# 원격 푸시
git push -u origin HEAD

# PR 자동 생성 (gh CLI 사용)
gh pr create --title "🚨 Hotfix: Critical Issue" \
             --body "Urgent fix for production issue" \
             --base main \
             --assignee @me
```

---

## 🔄 CI/CD 최적화 전략

### 1. GitHub Actions 워크플로우

#### 기본 CI 파이프라인
```yaml
# .github/workflows/ci.yml
name: CI Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
        
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ matrix.node-version }}
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run tests
      run: npm test
      
    - name: Run linting
      run: npm run lint
      
    - name: Build application
      run: npm run build

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Run security audit
      run: npm audit
      
    - name: Run CodeQL analysis
      uses: github/codeql-action/analyze@v2
```

#### 자동 배포 파이프라인
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]
    tags: ['v*']

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to Vultr
      run: |
        echo "${{ secrets.DEPLOY_SSH_KEY }}" > deploy_key
        chmod 600 deploy_key
        
        scp -i deploy_key -o StrictHostKeyChecking=no \
            dist/* root@141.164.60.51:/app/
            
        ssh -i deploy_key -o StrictHostKeyChecking=no \
            root@141.164.60.51 'docker-compose restart'
```

### 2. 자동 버전 관리

#### Semantic Release 설정
```json
{
  "name": "semantic-release-config",
  "plugins": [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    "@semantic-release/changelog",
    "@semantic-release/github",
    "@semantic-release/npm"
  ],
  "branches": [
    "main",
    {"name": "develop", "prerelease": true}
  ]
}
```

---

## 📈 성능 최적화

### 1. Git 성능 최적화

#### 대용량 저장소 최적화
```bash
# Git 압축 및 정리
git gc --aggressive --prune=now

# 대용량 파일 추적
git lfs track "*.zip"
git lfs track "*.tar.gz"
git lfs track "*.mp4"

# 히스토리 정리 (주의: 위험한 작업)
git filter-branch --tree-filter 'rm -rf large-directory' HEAD
```

#### 클론 최적화
```bash
# 얕은 클론 (빠른 클론)
git clone --depth 1 https://github.com/user/repo.git

# 특정 브랜치만 클론
git clone -b main --single-branch https://github.com/user/repo.git

# 부분 클론 (Git 2.19+)
git clone --filter=blob:none https://github.com/user/repo.git
```

### 2. 워크플로우 자동화

#### Git 별칭 설정
```bash
# ~/.gitconfig
[alias]
    st = status
    co = checkout
    br = branch
    ci = commit
    unstage = reset HEAD --
    last = log -1 HEAD
    visual = !gitk
    
    # 고급 별칭
    lg = log --color --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit
    
    # 브랜치 정리
    cleanup = "!git branch --merged | grep -v '\\*\\|main\\|develop' | xargs -n 1 git branch -d"
    
    # 빠른 커밋
    save = !git add -A && git commit -m 'SAVEPOINT'
    wip = !git add -u && git commit -m "WIP"
    undo = reset HEAD~1 --mixed
```

---

## 🎯 실행 계획

### Phase 1: 기본 설정 (1일)
1. Git 전역 설정 완료
2. GitHub CLI 인증 설정
3. MCP GitHub 서버 연동

### Phase 2: 프로젝트 구조화 (2-3일)
1. Monorepo 구조 마이그레이션
2. 브랜치 전략 적용
3. CI/CD 파이프라인 구축

### Phase 3: 자동화 구현 (1주)
1. 자동 배포 설정
2. 시크릿 관리 체계 구축
3. 모니터링 및 알림 설정

### Phase 4: 최적화 (지속적)
1. 성능 모니터링
2. 워크플로우 개선
3. 팀 협업 도구 통합

---

## 📞 문제 해결 가이드

### 일반적인 Git 문제
```bash
# 마지막 커밋 수정
git commit --amend

# 브랜치 강제 푸시 (주의)
git push --force-with-lease

# 충돌 해결 후 계속
git rebase --continue

# 브랜치 삭제
git branch -D branch-name
git push origin --delete branch-name
```

### GitHub Actions 디버깅
```bash
# 로컬에서 Actions 테스트
act -j test

# 시크릿 테스트
act -s GITHUB_TOKEN=your-token

# 특정 이벤트 시뮬레이션
act push
```

---

**작성일**: 2025-08-15  
**업데이트**: 지속적  
**담당**: Claude Code Team