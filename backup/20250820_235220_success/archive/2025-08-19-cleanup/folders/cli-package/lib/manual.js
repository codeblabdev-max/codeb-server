const chalk = require('chalk');

const manualContent = {
  ko: {
    main: {
      title: '📚 CodeB CLI 완전 사용 매뉴얼',
      sections: [
        { key: 'install', name: '설치 가이드', emoji: '📦' },
        { key: 'deploy', name: '배포 가이드', emoji: '🚀' },
        { key: 'config', name: '설정 관리', emoji: '⚙️' },
        { key: 'examples', name: '실제 예시', emoji: '💡' },
        { key: 'troubleshoot', name: '문제 해결', emoji: '🐛' },
        { key: 'advanced', name: '고급 사용법', emoji: '🔧' }
      ],
      footer: '\n💡 특정 섹션 보기: codeb doc <섹션명>\n💡 영어 버전: codeb doc --lang en'
    },
    
    install: {
      title: '📦 설치 가이드',
      content: `
${chalk.bold('🚀 빠른 설치')}

${chalk.cyan('방법 1: npm 전역 설치 (추천)')}
npm install -g codeb-cli

${chalk.cyan('방법 2: 로컬 설치')}
git clone https://github.com/your-username/codeb-cli.git
cd codeb-cli
./install.sh

${chalk.bold('📋 요구사항')}
• Node.js 18.0.0 이상
• npm 9.0.0 이상
• Git (배포할 프로젝트용)

${chalk.bold('🔧 설치 확인')}
codeb --version
codeb health
codeb config --show

${chalk.bold('🔄 업데이트')}
npm update -g codeb-cli

${chalk.bold('🗑️ 제거')}
npm uninstall -g codeb-cli
codeb config --reset  # 설정 초기화
`
    },

    deploy: {
      title: '🚀 배포 가이드',
      content: `
${chalk.bold('✨ 기본 배포')}

${chalk.cyan('Git 저장소 배포')}
codeb deploy my-app https://github.com/username/repository
→ https://my-app.one-q.xyz

${chalk.cyan('현재 폴더 배포 (Git 저장소)')}
cd /path/to/your/project
codeb init awesome-project
→ https://awesome-project.one-q.xyz

${chalk.bold('🎯 고급 옵션')}

${chalk.cyan('브랜치 지정')}
codeb deploy my-app https://github.com/user/repo --branch develop

${chalk.cyan('포트 지정')}
codeb deploy my-app https://github.com/user/repo --port 8080

${chalk.cyan('빌드 타입')}
codeb deploy my-app https://github.com/user/repo --type dockerfile

${chalk.cyan('데이터베이스 추가')}
codeb deploy my-app https://github.com/user/repo --db postgresql mysql redis

${chalk.cyan('환경변수 설정')}
codeb deploy my-app https://github.com/user/repo \\
  --env NODE_ENV=production \\
  --env API_KEY=secret123 \\
  --env DATABASE_URL=postgres://...

${chalk.bold('📊 배포 후 관리')}
codeb status                    # 모든 프로젝트 상태
codeb status my-app            # 특정 프로젝트 상태
codeb logs my-app              # 로그 확인
codeb delete my-app            # 프로젝트 삭제

${chalk.bold('⏱️ 배포 시간')}
• 일반적인 앱: 1-2분
• DNS 전파: 1-5분
• SSL 발급: 1-2분
`
    },

    config: {
      title: '⚙️ 설정 관리',
      content: `
${chalk.bold('📋 현재 설정 확인')}
codeb config --show

${chalk.bold('🌐 서버 설정')}
${chalk.cyan('기본 서버 (한국)')}
codeb config --server http://141.164.60.51:3007

${chalk.cyan('커스텀 서버')}
codeb config --server http://your-server.com:3007

${chalk.bold('🔄 설정 초기화')}
codeb config --reset

${chalk.bold('📁 설정 파일 위치')}
• macOS: ~/Library/Preferences/codeb-cli-nodejs/config.json
• Linux: ~/.config/codeb-cli-nodejs/config.json
• Windows: %APPDATA%/codeb-cli-nodejs/config.json

${chalk.bold('🔧 고급 설정')}

${chalk.cyan('API 타임아웃 (초)')}
# 직접 설정 파일 편집 필요
{
  "serverUrl": "http://141.164.60.51:3007",
  "apiTimeout": 300000
}

${chalk.cyan('프록시 설정 (npm 레벨)')}
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

${chalk.bold('✅ 설정 검증')}
codeb health                   # 서버 연결 확인
codeb status                   # API 작동 확인
`
    },

    examples: {
      title: '💡 실제 예시',
      content: `
${chalk.bold('🎯 실전 시나리오')}

${chalk.cyan('1. React 앱 배포')}
codeb deploy react-todo https://github.com/username/react-todo-app
→ https://react-todo.one-q.xyz

${chalk.cyan('2. Next.js + PostgreSQL')}
codeb deploy blog-app https://github.com/username/nextjs-blog \\
  --db postgresql \\
  --env NEXTAUTH_SECRET=your-secret \\
  --env NEXTAUTH_URL=https://blog-app.one-q.xyz
→ https://blog-app.one-q.xyz + PostgreSQL 데이터베이스

${chalk.cyan('3. Express API 서버')}
codeb deploy api-server https://github.com/username/express-api \\
  --port 3001 \\
  --db mongodb redis \\
  --env NODE_ENV=production
→ https://api-server.one-q.xyz + MongoDB + Redis

${chalk.cyan('4. 현재 프로젝트 배포')}
cd /path/to/my-awesome-project
git remote -v  # 원격 저장소 확인
codeb init awesome-project
→ https://awesome-project.one-q.xyz

${chalk.cyan('5. 개발/스테이징 환경')}
codeb deploy staging-app https://github.com/username/app \\
  --branch develop \\
  --env NODE_ENV=staging
→ https://staging-app.one-q.xyz

${chalk.cyan('6. Docker 기반 앱')}
codeb deploy docker-app https://github.com/username/docker-app \\
  --type dockerfile
→ https://docker-app.one-q.xyz

${chalk.bold('🔄 완전한 워크플로우')}

# 1. 개발
git clone https://github.com/username/my-project.git
cd my-project
# 개발 작업...

# 2. 스테이징 배포
codeb deploy staging-project . --branch develop

# 3. 프로덕션 배포
codeb deploy my-project . --branch main --env NODE_ENV=production

# 4. 상태 모니터링
codeb status
codeb logs my-project

${chalk.bold('📱 다양한 프레임워크')}

${chalk.cyan('• React/Vue/Angular 앱')}
자동 감지, 빌드 및 배포

${chalk.cyan('• Node.js 앱')}
Express, Fastify, Koa 등 자동 지원

${chalk.cyan('• Python 앱')}
Django, Flask, FastAPI 지원

${chalk.cyan('• PHP 앱')}
Laravel, WordPress 지원

${chalk.cyan('• Go 앱')}
Gin, Echo 등 지원
`
    },

    troubleshoot: {
      title: '🐛 문제 해결',
      content: `
${chalk.bold('🚨 자주 발생하는 문제')}

${chalk.cyan('1. 서버 연결 실패')}
문제: "서버 연결을 확인할 수 없습니다"
해결:
  codeb health
  codeb config --server http://141.164.60.51:3007

${chalk.cyan('2. Git 저장소 인식 실패')}
문제: "Git 저장소가 아니거나 원격 저장소가 설정되지 않았습니다"
해결:
  git remote -v  # 원격 저장소 확인
  git remote add origin https://github.com/username/repo

${chalk.cyan('3. 프로젝트 이름 오류')}
문제: "프로젝트 이름은 영문 소문자, 숫자, 하이픈만 사용 가능"
해결:
  ✅ my-app, blog2024, api-server
  ❌ My-App, blog_2024, api.server

${chalk.cyan('4. 배포 실패')}
문제: 배포 중 오류 발생
해결:
  codeb status my-app    # 상태 확인
  codeb logs my-app      # 로그 확인
  codeb health           # 서버 상태

${chalk.cyan('5. DNS 전파 지연')}
문제: 도메인이 바로 접근되지 않음
해결:
  # 1-5분 대기 (정상)
  dig +short my-app.one-q.xyz  # DNS 확인

${chalk.cyan('6. SSL 인증서 미발급')}
문제: HTTPS 접근 불가
해결:
  # 2-3분 대기 후 재시도
  curl -I http://my-app.one-q.xyz  # HTTP 확인

${chalk.bold('🔧 고급 문제 해결')}

${chalk.cyan('권한 오류')}
sudo npm install -g codeb-cli
# 또는 nvm 사용 권장

${chalk.cyan('네트워크 문제')}
npm config set registry https://registry.npmmirror.com
npm install -g codeb-cli

${chalk.cyan('Node.js 버전 문제')}
nvm install 18
nvm use 18
npm install -g codeb-cli

${chalk.bold('📞 추가 지원')}
• GitHub Issues: github.com/your-username/codeb-cli/issues
• 상세 가이드: codeb doc troubleshoot
• 서버 로그: 웹 대시보드 확인 (http://141.164.60.51:8000)
`
    },

    advanced: {
      title: '🔧 고급 사용법',
      content: `
${chalk.bold('🎯 전문가 기능')}

${chalk.cyan('1. 복잡한 환경변수 설정')}
codeb deploy complex-app https://github.com/user/repo \\
  --env NODE_ENV=production \\
  --env DATABASE_URL="postgres://user:pass@host:5432/db" \\
  --env REDIS_URL="redis://host:6379" \\
  --env JWT_SECRET="complex-secret-key-here" \\
  --env API_KEYS="key1,key2,key3"

${chalk.cyan('2. 다중 데이터베이스 구성')}
codeb deploy enterprise-app https://github.com/user/repo \\
  --db postgresql mysql redis mongodb \\
  --env POSTGRES_DB=main \\
  --env MYSQL_DB=analytics \\
  --env REDIS_DB=cache \\
  --env MONGO_DB=logs

${chalk.cyan('3. 커스텀 빌드 설정')}
# Dockerfile 사용
codeb deploy custom-app https://github.com/user/repo \\
  --type dockerfile \\
  --port 8080

# 특정 브랜치 + 커스텀 포트
codeb deploy dev-app https://github.com/user/repo \\
  --branch feature/new-api \\
  --port 3001

${chalk.bold('🔄 자동화 스크립트')}

${chalk.cyan('배포 스크립트 예시')}
#!/bin/bash
# deploy.sh

PROJECT_NAME="my-app"
REPO_URL="https://github.com/username/my-app"

echo "🚀 배포 시작: $PROJECT_NAME"

# 스테이징 배포
codeb deploy "\\${PROJECT_NAME}-staging" \\$REPO_URL \\
  --branch develop \\
  --env NODE_ENV=staging

# 프로덕션 배포 (확인 후)
read -p "프로덕션 배포를 진행하시겠습니까? (y/N): " confirm
if [[ $confirm == [yY] ]]; then
  codeb deploy \\$PROJECT_NAME \\$REPO_URL \\
    --branch main \\
    --env NODE_ENV=production \\
    --db postgresql redis
fi

echo "✅ 배포 완료"
codeb status

${chalk.cyan('CI/CD 통합 (GitHub Actions)')}
# .github/workflows/deploy.yml
name: Deploy to CodeB
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install -g codeb-cli
      - run: codeb deploy my-project-name .
        env:
          CODEB_SERVER: http://141.164.60.51:3007

${chalk.bold('🔍 모니터링 및 관리')}

${chalk.cyan('대시보드 활용')}
# 웹 대시보드 접근
open http://141.164.60.51:8000

${chalk.cyan('프로젝트 일괄 관리')}
# 모든 프로젝트 상태
codeb status | grep -E "(이름|상태|URL)"

# 특정 패턴 프로젝트만
codeb status | grep "staging"

${chalk.cyan('로그 모니터링')}
# 실시간 로그 (향후 지원 예정)
codeb logs my-app --follow

# 특정 라인 수
codeb logs my-app -n 500

${chalk.bold('🚀 배포 최적화 팁')}

${chalk.cyan('1. 프로젝트 이름 규칙')}
• 환경별: my-app-prod, my-app-staging, my-app-dev
• 버전별: my-app-v1, my-app-v2
• 기능별: my-app-api, my-app-web, my-app-admin

${chalk.cyan('2. 리소스 관리')}
# 사용하지 않는 프로젝트 정리
codeb delete old-project-name

${chalk.cyan('3. 보안 모범 사례')}
• 환경변수로 비밀 정보 관리
• 프로덕션과 개발 환경 분리
• 정기적인 의존성 업데이트

${chalk.bold('📈 성능 최적화')}
• 데이터베이스는 필요한 것만 생성
• 환경변수 최소화
• 적절한 포트 설정 (3000-8080 권장)
• Docker 이미지 크기 최적화 (Dockerfile 사용시)
`
    }
  },

  en: {
    main: {
      title: '📚 CodeB CLI Complete Manual',
      sections: [
        { key: 'install', name: 'Installation Guide', emoji: '📦' },
        { key: 'deploy', name: 'Deployment Guide', emoji: '🚀' },
        { key: 'config', name: 'Configuration', emoji: '⚙️' },
        { key: 'examples', name: 'Examples', emoji: '💡' },
        { key: 'troubleshoot', name: 'Troubleshooting', emoji: '🐛' },
        { key: 'advanced', name: 'Advanced Usage', emoji: '🔧' }
      ],
      footer: '\n💡 View specific section: codeb doc <section>\n💡 Korean version: codeb doc --lang ko'
    },
    
    install: {
      title: '📦 Installation Guide',
      content: `
${chalk.bold('🚀 Quick Installation')}

${chalk.cyan('Method 1: Global npm install (Recommended)')}
npm install -g codeb-cli

${chalk.cyan('Method 2: Local installation')}
git clone https://github.com/your-username/codeb-cli.git
cd codeb-cli
./install.sh

${chalk.bold('📋 Requirements')}
• Node.js 18.0.0 or higher
• npm 9.0.0 or higher
• Git (for projects to deploy)

${chalk.bold('🔧 Verify Installation')}
codeb --version
codeb health
codeb config --show

${chalk.bold('🔄 Update')}
npm update -g codeb-cli

${chalk.bold('🗑️ Uninstall')}
npm uninstall -g codeb-cli
codeb config --reset  # Reset configuration
`
    },

    deploy: {
      title: '🚀 Deployment Guide',
      content: `
${chalk.bold('✨ Basic Deployment')}

${chalk.cyan('Deploy Git Repository')}
codeb deploy my-app https://github.com/username/repository
→ https://my-app.one-q.xyz

${chalk.cyan('Deploy Current Directory (Git repository)')}
cd /path/to/your/project
codeb init awesome-project
→ https://awesome-project.one-q.xyz

${chalk.bold('🎯 Advanced Options')}

${chalk.cyan('Specify Branch')}
codeb deploy my-app https://github.com/user/repo --branch develop

${chalk.cyan('Custom Port')}
codeb deploy my-app https://github.com/user/repo --port 8080

${chalk.cyan('Build Type')}
codeb deploy my-app https://github.com/user/repo --type dockerfile

${chalk.cyan('Add Databases')}
codeb deploy my-app https://github.com/user/repo --db postgresql mysql redis

${chalk.cyan('Environment Variables')}
codeb deploy my-app https://github.com/user/repo \\
  --env NODE_ENV=production \\
  --env API_KEY=secret123 \\
  --env DATABASE_URL=postgres://...

${chalk.bold('📊 Post-Deployment Management')}
codeb status                    # All projects status
codeb status my-app            # Specific project status
codeb logs my-app              # View logs
codeb delete my-app            # Delete project

${chalk.bold('⏱️ Deployment Time')}
• Typical app: 1-2 minutes
• DNS propagation: 1-5 minutes
• SSL issuance: 1-2 minutes
`
    },

    config: {
      title: '⚙️ Configuration Management',
      content: `
${chalk.bold('📋 View Current Configuration')}
codeb config --show

${chalk.bold('🌐 Server Configuration')}
${chalk.cyan('Default Server (Korea)')}
codeb config --server http://141.164.60.51:3007

${chalk.cyan('Custom Server')}
codeb config --server http://your-server.com:3007

${chalk.bold('🔄 Reset Configuration')}
codeb config --reset

${chalk.bold('📁 Configuration File Location')}
• macOS: ~/Library/Preferences/codeb-cli-nodejs/config.json
• Linux: ~/.config/codeb-cli-nodejs/config.json
• Windows: %APPDATA%/codeb-cli-nodejs/config.json

${chalk.bold('🔧 Advanced Configuration')}

${chalk.cyan('API Timeout (seconds)')}
# Direct config file editing required
{
  "serverUrl": "http://141.164.60.51:3007",
  "apiTimeout": 300000
}

${chalk.cyan('Proxy Settings (npm level)')}
npm config set proxy http://proxy.company.com:8080
npm config set https-proxy http://proxy.company.com:8080

${chalk.bold('✅ Configuration Validation')}
codeb health                   # Check server connection
codeb status                   # Check API functionality
`
    },

    examples: {
      title: '💡 Real Examples',
      content: `
${chalk.bold('🎯 Real-world Scenarios')}

${chalk.cyan('1. React App Deployment')}
codeb deploy react-todo https://github.com/username/react-todo-app
→ https://react-todo.one-q.xyz

${chalk.cyan('2. Next.js + PostgreSQL')}
codeb deploy blog-app https://github.com/username/nextjs-blog \\
  --db postgresql \\
  --env NEXTAUTH_SECRET=your-secret \\
  --env NEXTAUTH_URL=https://blog-app.one-q.xyz
→ https://blog-app.one-q.xyz + PostgreSQL database

${chalk.cyan('3. Express API Server')}
codeb deploy api-server https://github.com/username/express-api \\
  --port 3001 \\
  --db mongodb redis \\
  --env NODE_ENV=production
→ https://api-server.one-q.xyz + MongoDB + Redis

${chalk.cyan('4. Current Project Deployment')}
cd /path/to/my-awesome-project
git remote -v  # Check remote repository
codeb init awesome-project
→ https://awesome-project.one-q.xyz

${chalk.cyan('5. Development/Staging Environment')}
codeb deploy staging-app https://github.com/username/app \\
  --branch develop \\
  --env NODE_ENV=staging
→ https://staging-app.one-q.xyz

${chalk.cyan('6. Docker-based App')}
codeb deploy docker-app https://github.com/username/docker-app \\
  --type dockerfile
→ https://docker-app.one-q.xyz

${chalk.bold('🔄 Complete Workflow')}

# 1. Development
git clone https://github.com/username/my-project.git
cd my-project
# Development work...

# 2. Staging deployment
codeb deploy staging-project . --branch develop

# 3. Production deployment
codeb deploy my-project . --branch main --env NODE_ENV=production

# 4. Status monitoring
codeb status
codeb logs my-project

${chalk.bold('📱 Various Frameworks')}

${chalk.cyan('• React/Vue/Angular Apps')}
Auto-detection, build and deploy

${chalk.cyan('• Node.js Apps')}
Express, Fastify, Koa etc. auto-supported

${chalk.cyan('• Python Apps')}
Django, Flask, FastAPI supported

${chalk.cyan('• PHP Apps')}
Laravel, WordPress supported

${chalk.cyan('• Go Apps')}
Gin, Echo etc. supported
`
    },

    troubleshoot: {
      title: '🐛 Troubleshooting',
      content: `
${chalk.bold('🚨 Common Issues')}

${chalk.cyan('1. Server Connection Failed')}
Issue: "Cannot verify server connection"
Solution:
  codeb health
  codeb config --server http://141.164.60.51:3007

${chalk.cyan('2. Git Repository Not Recognized')}
Issue: "Not a Git repository or remote repository not configured"
Solution:
  git remote -v  # Check remote repository
  git remote add origin https://github.com/username/repo

${chalk.cyan('3. Project Name Error')}
Issue: "Project name can only use lowercase letters, numbers, hyphens"
Solution:
  ✅ my-app, blog2024, api-server
  ❌ My-App, blog_2024, api.server

${chalk.cyan('4. Deployment Failed')}
Issue: Error during deployment
Solution:
  codeb status my-app    # Check status
  codeb logs my-app      # Check logs
  codeb health           # Server status

${chalk.cyan('5. DNS Propagation Delay')}
Issue: Domain not immediately accessible
Solution:
  # Wait 1-5 minutes (normal)
  dig +short my-app.one-q.xyz  # Check DNS

${chalk.cyan('6. SSL Certificate Not Issued')}
Issue: HTTPS access unavailable
Solution:
  # Wait 2-3 minutes then retry
  curl -I http://my-app.one-q.xyz  # Check HTTP

${chalk.bold('🔧 Advanced Troubleshooting')}

${chalk.cyan('Permission Error')}
sudo npm install -g codeb-cli
# Or use nvm (recommended)

${chalk.cyan('Network Issues')}
npm config set registry https://registry.npmmirror.com
npm install -g codeb-cli

${chalk.cyan('Node.js Version Issues')}
nvm install 18
nvm use 18
npm install -g codeb-cli

${chalk.bold('📞 Additional Support')}
• GitHub Issues: github.com/your-username/codeb-cli/issues
• Detailed Guide: codeb doc troubleshoot
• Server Logs: Web dashboard (http://141.164.60.51:8000)
`
    },

    advanced: {
      title: '🔧 Advanced Usage',
      content: `
${chalk.bold('🎯 Expert Features')}

${chalk.cyan('1. Complex Environment Variables')}
codeb deploy complex-app https://github.com/user/repo \\
  --env NODE_ENV=production \\
  --env DATABASE_URL="postgres://user:pass@host:5432/db" \\
  --env REDIS_URL="redis://host:6379" \\
  --env JWT_SECRET="complex-secret-key-here" \\
  --env API_KEYS="key1,key2,key3"

${chalk.cyan('2. Multi-Database Configuration')}
codeb deploy enterprise-app https://github.com/user/repo \\
  --db postgresql mysql redis mongodb \\
  --env POSTGRES_DB=main \\
  --env MYSQL_DB=analytics \\
  --env REDIS_DB=cache \\
  --env MONGO_DB=logs

${chalk.cyan('3. Custom Build Settings')}
# Using Dockerfile
codeb deploy custom-app https://github.com/user/repo \\
  --type dockerfile \\
  --port 8080

# Specific branch + custom port
codeb deploy dev-app https://github.com/user/repo \\
  --branch feature/new-api \\
  --port 3001

${chalk.bold('🔄 Automation Scripts')}

${chalk.cyan('Deployment Script Example')}
#!/bin/bash
# deploy.sh

PROJECT_NAME="my-app"
REPO_URL="https://github.com/username/my-app"

echo "🚀 Starting deployment: $PROJECT_NAME"

# Staging deployment
codeb deploy "\\${PROJECT_NAME}-staging" \\$REPO_URL \\
  --branch develop \\
  --env NODE_ENV=staging

# Production deployment (after confirmation)
read -p "Proceed with production deployment? (y/N): " confirm
if [[ $confirm == [yY] ]]; then
  codeb deploy \\$PROJECT_NAME \\$REPO_URL \\
    --branch main \\
    --env NODE_ENV=production \\
    --db postgresql redis
fi

echo "✅ Deployment complete"
codeb status

${chalk.cyan('CI/CD Integration (GitHub Actions)')}
# .github/workflows/deploy.yml
name: Deploy to CodeB
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm install -g codeb-cli
      - run: codeb deploy my-project-name .
        env:
          CODEB_SERVER: http://141.164.60.51:3007

${chalk.bold('🔍 Monitoring and Management')}

${chalk.cyan('Dashboard Usage')}
# Access web dashboard
open http://141.164.60.51:8000

${chalk.cyan('Bulk Project Management')}
# All project status
codeb status | grep -E "(Name|Status|URL)"

# Specific pattern projects only
codeb status | grep "staging"

${chalk.cyan('Log Monitoring')}
# Real-time logs (coming soon)
codeb logs my-app --follow

# Specific line count
codeb logs my-app -n 500

${chalk.bold('🚀 Deployment Optimization Tips')}

${chalk.cyan('1. Project Naming Convention')}
• By environment: my-app-prod, my-app-staging, my-app-dev
• By version: my-app-v1, my-app-v2
• By function: my-app-api, my-app-web, my-app-admin

${chalk.cyan('2. Resource Management')}
# Clean up unused projects
codeb delete old-project-name

${chalk.cyan('3. Security Best Practices')}
• Manage secrets via environment variables
• Separate production and development environments
• Regular dependency updates

${chalk.bold('📈 Performance Optimization')}
• Create only necessary databases
• Minimize environment variables
• Proper port configuration (3000-8080 recommended)
• Docker image size optimization (when using Dockerfile)
`
    }
  }
};

module.exports = manualContent;