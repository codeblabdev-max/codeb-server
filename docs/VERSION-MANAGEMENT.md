# CodeB 버전 관리 가이드

> **문서 버전**: 8.0.0
> **최종 업데이트**: 2026-02-06

---

## 목차

1. [SSOT (Single Source of Truth)](#1-ssot-single-source-of-truth)
2. [버전 동기화 대상](#2-버전-동기화-대상)
3. [자동 배포 흐름](#3-자동-배포-흐름)
4. [버전 확인 방법](#4-버전-확인-방법)
5. [클라이언트 버전 체크](#5-클라이언트-버전-체크)

---

## 1. SSOT (Single Source of Truth)

### 1.1 VERSION 파일이 기준

```
codeb-server/VERSION
```

이 파일의 값이 모든 버전의 기준입니다. 다른 모든 파일은 이 값에서 파생됩니다.

### 1.2 버전 형식

```
MAJOR.MINOR.PATCH
  8    .0   .0

MAJOR: 대규모 변경 (Breaking Changes, 아키텍처 변경)
MINOR: 기능 추가 (Features, 새로운 API)
PATCH: 버그 수정, 소규모 개선 (Fixes, Docs)
```

---

## 2. 버전 동기화 대상

### 2.1 필수 동기화 (자동)

| 파일 | 용도 | 동기화 방법 |
|------|------|------------|
| `VERSION` | **SSOT** | 기준 |
| `package.json` | 프로젝트 메타 | jq |
| `mcp-server/package.json` | API 서버 | jq |
| `cli/package.json` | CLI 패키지 | jq |
| `CLAUDE.md` | 규칙 문서 | sed |
| `cli/rules/CLAUDE.md` | 배포용 규칙 | sed |

### 2.2 서버 배포 대상

| 대상 | URL | 동기화 방법 |
|------|-----|------------|
| API Server | api.codeb.kr | Docker 재시작 |
| CLI Package | releases.codeb.kr/cli | Minio 업로드 |
| SSOT Registry | /opt/codeb/registry | JSON 업데이트 |

### 2.3 선택적 동기화

| 파일 | 동기화 시점 |
|------|------------|
| `docs/*.md` | 내용 변경 시 |
| `package-lock.json` | npm install 시 |

---

## 3. 자동 배포 흐름

### 3.1 GitHub Actions (권장)

```
┌─────────────────────────────────────────────────────────────────┐
│                    git push → 자동 배포                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. git push origin main                                        │
│     │                                                           │
│     ▼                                                           │
│  2. GitHub Actions 트리거                                       │
│     │ runs-on: [self-hosted, docker]                           │
│     ▼                                                           │
│  3. 버전 동기화                                                  │
│     │ VERSION → package.json → CLAUDE.md                       │
│     ▼                                                           │
│  4. API Server 배포                                              │
│     │ TypeScript 빌드 → Docker 이미지 → systemctl 재시작       │
│     ▼                                                           │
│  5. CLI Package 배포                                             │
│     │ tarball 생성 → Minio 업로드                              │
│     ▼                                                           │
│  6. SSOT Registry 업데이트                                       │
│     │ /opt/codeb/registry/versions.json                        │
│     ▼                                                           │
│  7. 헬스체크 검증                                                │
│     │ api.codeb.kr/health + releases.codeb.kr/cli/version.json │
│     ▼                                                           │
│  ✅ 배포 완료                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 수동 배포 (백업용)

```bash
# 전체 배포
./scripts/deploy-all.sh [version]

# 예시
./scripts/deploy-all.sh 8.0.1
```

---

## 4. 버전 확인 방법

### 4.1 로컬 버전

```bash
# VERSION 파일
cat VERSION

# package.json들
jq -r '.version' package.json mcp-server/package.json cli/package.json
```

### 4.2 서버 버전

```bash
# API Server
curl -sf https://api.codeb.kr/health | jq '.version'

# CLI Package (Minio)
curl -sf https://releases.codeb.kr/cli/version.json | jq '.version'

# SSOT Registry
ssh root@158.247.203.55 "cat /opt/codeb/registry/versions.json | jq '.ssot_version'"
```

### 4.3 전체 버전 비교

```bash
echo "=== 버전 현황 ==="
echo "VERSION 파일:     $(cat VERSION)"
echo "API Server:       $(curl -sf https://api.codeb.kr/health | jq -r '.version')"
echo "CLI Package:      $(curl -sf https://releases.codeb.kr/cli/version.json | jq -r '.version')"
```

---

## 5. 클라이언트 버전 체크

### 5.1 API 자동 버전 체크

API 서버는 클라이언트 버전을 자동으로 확인합니다:

```bash
# 클라이언트가 X-Client-Version 헤더 전송
curl -H "X-Client-Version: 7.0.66" https://api.codeb.kr/health
```

**응답 (버전이 낮은 경우):**
```json
{
  "status": "healthy",
  "version": "8.0.0",
  "updateRequired": true,
  "updateMessage": "CLI 업데이트 필요: 7.0.66 → 8.0.0\ncurl -sSL https://releases.codeb.kr/cli/install.sh | bash",
  "latestVersion": "8.0.0",
  "downloadUrl": "https://releases.codeb.kr/cli/install.sh"
}
```

### 5.2 CLI 업데이트 명령

```bash
# CLI 업데이트
curl -sSL https://releases.codeb.kr/cli/install.sh | bash

# 프로젝트별 CLI 업데이트 (workb 방식)
curl -sSL https://releases.codeb.kr/cli/project-update.sh | bash
```

---

## 6. 버전 불일치 해결

### 6.1 증상별 조치

| 증상 | 원인 | 해결 방법 |
|------|------|----------|
| API 버전 불일치 | Docker 재시작 안 됨 | `ssh root@158.247.203.55 "systemctl restart codeb-mcp-api"` |
| CLI 버전 불일치 | Minio 업로드 실패 | deploy-all.sh 재실행 |
| 전체 불일치 | 배포 중단됨 | git push로 GitHub Actions 재실행 |

### 6.2 강제 동기화

```bash
# GitHub Actions 수동 실행 (버전 지정)
# GitHub 웹 → Actions → Run workflow → version: 8.0.0

# 또는 로컬에서 수동 배포
./scripts/deploy-all.sh 8.0.0
```

---

## 관련 문서

- [deployment-guide.md](./deployment-guide.md) - 배포 가이드
- [DEPLOY-FLOW.md](./DEPLOY-FLOW.md) - 배포 플로우 상세
- [API-REFERENCE.md](./API-REFERENCE.md) - MCP API 도구 문서
- [../CLAUDE.md](../CLAUDE.md) - Claude Code 규칙
