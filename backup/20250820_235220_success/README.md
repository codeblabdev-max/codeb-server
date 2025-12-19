# CodeB Server - 컨테이너 기반 프로젝트 관리 시스템

> **서버**: 141.164.60.51  
> **관리 API**: http://141.164.60.51:3008  
> **Caddy 프록시**: HTTPS 자동 설정

## 🚀 빠른 시작

```bash
# 1. 프로젝트 생성 (GitHub에서)
curl -X POST http://141.164.60.51:3008/api/projects \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-app",
    "template": "nextjs",
    "gitUrl": "https://github.com/username/repo.git"
  }'

# 2. 프로젝트 시작
curl -X POST http://141.164.60.51:3008/api/projects/my-app/start

# 3. 접속
https://my-app.codeb.one-q.xyz
```

## 📚 문서

- [서버 API 문서](./SERVER_API.md) - API 엔드포인트 상세
- [CLI 사용법](./CLI_GUIDE.md) - 로컬 CLI 도구
- [배포 가이드](./DEPLOYMENT_GUIDE.md) - Git 배포 방법
- [도메인 설정](./DOMAIN_SETUP.md) - DNS 및 SSL 설정

## 🏗️ 시스템 구성

```
CodeB Server
├── API Server (포트 3008) - 프로젝트 관리 API
├── Caddy (포트 80/443) - 리버스 프록시 & SSL
├── BIND9 (포트 53) - DNS 서버
└── Podman - 컨테이너 관리
    ├── PostgreSQL 컨테이너
    ├── Redis 컨테이너
    └── 애플리케이션 컨테이너
```

## 🔧 주요 기능

- **Git 배포**: GitHub/GitLab 저장소에서 직접 배포
- **자동 도메인**: `프로젝트명.codeb.one-q.xyz` 자동 생성
- **SSL 인증서**: Let's Encrypt 자동 발급
- **데이터베이스**: PostgreSQL + Prisma 자동 설정
- **캐싱**: Redis 자동 구성
- **환경변수**: 자동 생성 및 관리

## 📞 지원

문제 발생 시:
1. API 상태 확인: `curl http://141.164.60.51:3008/health`
2. 서버 로그: `ssh root@141.164.60.51 "pm2 logs"`
3. 컨테이너 상태: `ssh root@141.164.60.51 "podman ps"`