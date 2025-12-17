# CLAUDE.md - CodeB Project Rules

## Critical Rules

### 1. NEVER Run Dangerous Commands Directly

```bash
# 절대 금지 (Hooks가 차단함)
podman rm -f <container>       # 직접 컨테이너 삭제
podman volume rm <volume>      # 직접 볼륨 삭제
docker-compose down -v         # 볼륨 포함 삭제
rm -rf /opt/codeb/projects/*   # 프로젝트 폴더 삭제
```

### 2. ALWAYS Use CLI Commands

```bash
# 올바른 방법
we workflow init <project>     # 프로젝트 초기화
we deploy <project>            # 배포
we workflow stop <project>     # 서비스 중지
we workflow scan <project>     # 상태 확인
we ssot sync                   # 서버 데이터 동기화
```

### 3. SSH Only to Allowed Servers

허용된 서버만 SSH 접속 가능:
- 141.164.60.51 (CodeB Infra)
- 158.247.203.55 (Videopick App)
- 141.164.42.213 (Videopick Streaming)
- 64.176.226.119 (Videopick Storage)
- 141.164.37.63 (Videopick Backup)

### 4. Environment File Protection

- NEVER overwrite existing .env files without backup
- Protected variables: DATABASE_URL, REDIS_URL, POSTGRES_*

## Quick Reference

```bash
# 프로젝트 초기화
we workflow init myapp --type nextjs --database --redis

# 서버 상태 확인
we ssot status
we ssot projects
we workflow scan myapp

# 배포
we deploy myapp --environment staging

# 도메인 설정
we domain setup myapp.codeb.dev --ssl
```

## Permission Model

- **Admin**: SSH + deploy + server settings
- **Developer**: Git Push only → GitHub Actions → auto deploy
