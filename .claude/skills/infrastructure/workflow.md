---
name: workflow
description: "CI/CD 워크플로우 생성 (Minio S3 캐시 + Private Registry)"
agent: Bash
context: fork
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - mcp__codeb-deploy__workflow_init
  - mcp__codeb-deploy__workflow_scan
---

# /we:workflow - CI/CD 워크플로우 생성

## 목적
Minio S3 캐시 + Private Registry (64.176.226.119:5000) 기반의
GitHub Actions CI/CD 워크플로우를 생성합니다.

## 핵심 원칙
- **모든 응답은 한글로 작성**
- GHCR이 아닌 **Private Registry** (64.176.226.119:5000) 사용
- 빌드 캐시는 **Minio S3** (64.176.226.119:9000) 사용
- Runner는 **self-hosted** ([self-hosted, docker])
- 기존 설정이 있으면 백업 후 업데이트

## CI/CD 파이프라인
```
git push main
  → GitHub Actions (self-hosted runner)
  → Docker Buildx + Minio S3 캐시
  → Private Registry Push (커밋 SHA 태그)
  → curl MCP API /api/tool (deploy)
  → Blue-Green 배포 → Preview URL
```

## 자동 실행 플로우

### 워크플로우 스캔 (scan)
```
mcp__codeb-deploy__workflow_scan { "projectName": "프로젝트명" }
```

### 워크플로우 초기화 (init)
```
mcp__codeb-deploy__workflow_init {
  "projectName": "프로젝트명",
  "type": "nextjs",
  "database": true,
  "redis": true
}
```

## 생성 파일
- `Dockerfile` - 컨테이너 이미지 정의
- `.github/workflows/deploy.yml` - Minio S3 캐시 기반 CI/CD

## 필수 GitHub Secrets
| Secret | 설명 |
|--------|------|
| `CODEB_API_KEY` | MCP API 키 |
| `MINIO_ACCESS_KEY` | Minio S3 Access Key |
| `MINIO_SECRET_KEY` | Minio S3 Secret Key |

## 사용법
```
/we:workflow init <프로젝트> [옵션]
/we:workflow scan <프로젝트>
```

## 옵션
- `--type` - 프로젝트 타입 (nextjs, remix, nodejs, python, go)
- `--no-database` - PostgreSQL 제외
- `--no-redis` - Redis 제외

## 서버 정보
- **App 서버**: 158.247.203.55 (Self-Hosted Runner)
- **Private Registry**: 64.176.226.119:5000
- **Minio S3**: 64.176.226.119:9000 (bucket: docker-cache)

## 관련 명령어
- `/we:deploy` - Git Push 기반 배포
- `/we:init` - 신규 프로젝트 초기화
- `/we:domain` - 도메인 설정
