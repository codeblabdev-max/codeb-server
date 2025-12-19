# CodeB Deploy System - 보안 스캔 가이드

## 목차
1. [보안 스캔 개요](#보안-스캔-개요)
2. [이미지 취약점 스캔 (Trivy)](#이미지-취약점-스캔-trivy)
3. [시크릿 스캔 (gitleaks)](#시크릿-스캔-gitleaks)
4. [SBOM 생성](#sbom-생성)
5. [CI/CD 통합](#cicd-통합)
6. [베스트 프랙티스](#베스트-프랙티스)

---

## 보안 스캔 개요

### 스캔 도구

| 도구 | 용도 | 스캔 대상 |
|------|------|----------|
| **Trivy** | 취약점 스캔 | 컨테이너 이미지, 파일시스템 |
| **gitleaks** | 시크릿 검출 | Git 저장소, 코드 파일 |
| **Syft** | SBOM 생성 | 컨테이너 이미지, 패키지 |

### 스캔 시점

```
┌─────────────────────────────────────────────────────────┐
│                    보안 스캔 파이프라인                   │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │  코드    │    │   빌드   │    │   배포   │          │
│  │  커밋    │───▶│  완료    │───▶│  전     │          │
│  └────┬─────┘    └────┬─────┘    └────┬─────┘          │
│       │               │               │                 │
│       ▼               ▼               ▼                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ gitleaks │    │  Trivy   │    │ 최종검증  │          │
│  │ 시크릿   │    │ 이미지   │    │ + SBOM   │          │
│  │  스캔    │    │  스캔    │    │  생성    │          │
│  └──────────┘    └──────────┘    └──────────┘          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 이미지 취약점 스캔 (Trivy)

### 개요

Trivy는 컨테이너 이미지의 OS 패키지 및 애플리케이션 종속성 취약점을 검사합니다.

### MCP를 통한 스캔

```bash
# Claude Code에서
"myapp 이미지 보안 스캔해줘"
"myapp 이미지 CRITICAL 취약점만 스캔해줘"
"myapp:v1.0.0 이미지 스캔해줘"
```

### 스캔 파라미터

```typescript
{
  projectName: string;       // 프로젝트 이름 (필수)
  scanType: 'image';         // 스캔 유형
  imageTag?: string;         // 이미지 태그 (기본: latest)
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';  // 최소 심각도
  failOnVulnerability?: boolean;  // 취약점 발견 시 실패
}
```

### 심각도 레벨

| 레벨 | 설명 | CVSS 점수 | 대응 |
|------|------|----------|------|
| CRITICAL | 치명적 취약점 | 9.0-10.0 | 즉시 수정 |
| HIGH | 높은 위험 | 7.0-8.9 | 24시간 내 수정 |
| MEDIUM | 중간 위험 | 4.0-6.9 | 1주일 내 수정 |
| LOW | 낮은 위험 | 0.1-3.9 | 다음 릴리스에 수정 |

### 스캔 결과 예시

```json
{
  "success": true,
  "imageTag": "myapp:latest",
  "summary": {
    "critical": 0,
    "high": 2,
    "medium": 5,
    "low": 12
  },
  "vulnerabilities": [
    {
      "id": "CVE-2023-12345",
      "package": "openssl",
      "installedVersion": "1.1.1k",
      "fixedVersion": "1.1.1l",
      "severity": "HIGH",
      "title": "OpenSSL Buffer Overflow",
      "description": "A buffer overflow vulnerability..."
    }
  ],
  "recommendations": [
    "Update openssl to version 1.1.1l or later",
    "Rebuild the container image with updated base image"
  ]
}
```

### 명령줄 직접 실행

```bash
# 서버에서 직접 실행
trivy image localhost:5000/myapp:latest

# 심각도 필터링
trivy image --severity CRITICAL,HIGH localhost:5000/myapp:latest

# JSON 출력
trivy image --format json --output results.json localhost:5000/myapp:latest

# 종료 코드로 CI 통합
trivy image --exit-code 1 --severity CRITICAL localhost:5000/myapp:latest
```

### 취약점 무시 (예외 처리)

`.trivyignore` 파일 생성:

```
# 허용되는 취약점 (리스크 수용)
CVE-2023-12345

# 특정 패키지 취약점 무시
pkg:npm/lodash@4.17.20
```

---

## 시크릿 스캔 (gitleaks)

### 개요

gitleaks는 코드 저장소에서 하드코딩된 시크릿(API 키, 비밀번호, 토큰 등)을 검출합니다.

### MCP를 통한 스캔

```bash
# Claude Code에서
"myapp 시크릿 스캔해줘"
"현재 저장소 시크릿 검사해줘"
```

### 스캔 파라미터

```typescript
{
  projectName: string;       // 프로젝트 이름 (필수)
  scanType: 'secrets';       // 스캔 유형
  repoPath?: string;         // 저장소 경로
}
```

### 검출 대상

| 유형 | 패턴 예시 |
|------|----------|
| AWS Keys | `AKIA...` |
| GitHub Token | `ghp_...`, `gho_...` |
| Slack Token | `xoxb-...`, `xoxp-...` |
| Private Keys | `-----BEGIN RSA PRIVATE KEY-----` |
| Database URLs | `postgres://user:pass@host/db` |
| API Keys | 다양한 패턴 |

### 스캔 결과 예시

```json
{
  "success": false,
  "secretsFound": 3,
  "findings": [
    {
      "description": "AWS Access Key ID",
      "file": "src/config.js",
      "line": 15,
      "secret": "AKIA***********",
      "rule": "aws-access-key-id",
      "commit": "abc123"
    },
    {
      "description": "GitHub Personal Access Token",
      "file": ".env.example",
      "line": 5,
      "secret": "ghp_***********",
      "rule": "github-pat",
      "commit": "def456"
    }
  ],
  "recommendations": [
    "Rotate the exposed AWS credentials immediately",
    "Revoke the GitHub token and generate a new one",
    "Use environment variables or secret managers"
  ]
}
```

### 시크릿 무시 (예외 처리)

`.gitleaksignore` 파일 생성:

```
# 테스트 파일의 mock 시크릿
tests/fixtures/mock-api-key

# 특정 파일 무시
docs/examples/sample-config.yaml

# 특정 커밋 무시
abc123def456
```

### `.gitleaks.toml` 커스텀 설정

```toml
title = "Custom gitleaks config"

[extend]
useDefault = true

[[rules]]
description = "Custom API Key"
regex = '''mycompany_api_key_[a-zA-Z0-9]{32}'''
tags = ["custom", "api-key"]

[allowlist]
description = "Global allowlist"
paths = [
    '''tests/.*''',
    '''docs/.*'''
]
```

---

## SBOM 생성

### 개요

SBOM (Software Bill of Materials)은 소프트웨어의 구성 요소 목록으로, 공급망 보안에 필수적입니다.

### MCP를 통한 SBOM 생성

```bash
# Claude Code에서
"myapp SBOM 생성해줘"
"myapp CycloneDX 형식으로 SBOM 만들어줘"
"myapp SPDX-JSON 형식으로 SBOM 생성해줘"
```

### 지원 형식

| 형식 | 설명 | 용도 |
|------|------|------|
| `spdx-json` | SPDX JSON 형식 | 표준 규격, 정부/법규 요구 |
| `cyclonedx` | CycloneDX JSON | 보안 중심, 취약점 연계 |
| `github` | GitHub 형식 | GitHub Dependency Graph |

### SBOM 생성 파라미터

```typescript
{
  projectName: string;       // 프로젝트 이름 (필수)
  imageTag?: string;         // 이미지 태그
  format?: 'spdx-json' | 'cyclonedx' | 'github';  // 출력 형식
}
```

### SBOM 출력 예시 (CycloneDX)

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "metadata": {
    "timestamp": "2024-01-15T10:30:00Z",
    "component": {
      "name": "myapp",
      "version": "1.0.0",
      "type": "container"
    }
  },
  "components": [
    {
      "name": "node",
      "version": "20.10.0",
      "type": "application",
      "purl": "pkg:npm/node@20.10.0"
    },
    {
      "name": "express",
      "version": "4.18.2",
      "type": "library",
      "purl": "pkg:npm/express@4.18.2"
    },
    {
      "name": "alpine",
      "version": "3.18",
      "type": "operating-system",
      "purl": "pkg:alpine/alpine@3.18"
    }
  ]
}
```

### SBOM 활용

1. **취약점 분석**: SBOM + VEX (Vulnerability Exploitability eXchange)
2. **라이선스 준수**: 구성 요소별 라이선스 확인
3. **공급망 보안**: 의존성 추적 및 검증
4. **규정 준수**: NTIA 최소 요소 충족

---

## CI/CD 통합

### GitHub Actions 워크플로우

```yaml
# .github/workflows/security.yml
name: Security Scan

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  secrets-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run gitleaks
        uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  image-scan:
    runs-on: self-hosted
    needs: build
    steps:
      - name: Run Trivy
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: 'localhost:5000/${{ github.event.repository.name }}:${{ github.sha }}'
          format: 'sarif'
          output: 'trivy-results.sarif'
          severity: 'CRITICAL,HIGH'
          exit-code: '1'

      - name: Upload Trivy results
        uses: github/codeql-action/upload-sarif@v2
        with:
          sarif_file: 'trivy-results.sarif'

  sbom-generate:
    runs-on: self-hosted
    needs: build
    steps:
      - name: Generate SBOM
        run: |
          syft localhost:5000/${{ github.event.repository.name }}:${{ github.sha }} \
            -o cyclonedx-json > sbom.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v3
        with:
          name: sbom
          path: sbom.json
```

### PR 체크 통합

```yaml
# .github/workflows/pr-check.yml
name: PR Security Check

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  security-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Secret Scan
        run: |
          docker run -v $(pwd):/path zricethezav/gitleaks:latest \
            detect --source=/path --no-git

      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🚨 Security scan found issues. Please review and fix before merging.'
            })
```

---

## 베스트 프랙티스

### 1. 스캔 빈도

| 스캔 유형 | 권장 빈도 | 트리거 |
|----------|----------|--------|
| 시크릿 스캔 | 모든 커밋 | pre-commit, PR |
| 이미지 스캔 | 빌드마다 | CI/CD |
| SBOM 생성 | 릴리스마다 | 태그 생성 시 |

### 2. 시크릿 관리

```yaml
# DO: 환경 변수 사용
DATABASE_URL: ${DATABASE_URL}

# DON'T: 하드코딩
DATABASE_URL: "postgres://user:password@localhost/db"
```

권장 도구:
- HashiCorp Vault
- AWS Secrets Manager
- 환경 변수 (배포 시 주입)

### 3. 이미지 보안

```dockerfile
# 최소 베이스 이미지 사용
FROM node:20-alpine

# 비-root 사용자로 실행
USER node

# 불필요한 파일 제외
COPY --chown=node:node package*.json ./
RUN npm ci --only=production

# 헬스체크 추가
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:3000/health || exit 1
```

### 4. 취약점 대응 프로세스

```
┌─────────────────────────────────────────────────────────┐
│               취약점 대응 프로세스                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. 발견 ──▶ 2. 분류 ──▶ 3. 우선순위 ──▶ 4. 수정        │
│     │          │           │             │              │
│     ▼          ▼           ▼             ▼              │
│  스캔 결과   심각도 평가   CVSS 점수    패치/업데이트     │
│  리뷰        영향 분석     비즈니스     테스트           │
│              익스플로잇    영향도       배포             │
│              가능성                                      │
│                                                          │
│  5. 검증 ──▶ 6. 문서화 ──▶ 7. 모니터링                  │
│     │          │             │                          │
│     ▼          ▼             ▼                          │
│  재스캔      CVE 기록      지속적 스캔                   │
│  테스트      대응 기록      알림 설정                    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 5. 정기 점검

- **주간**: 취약점 리포트 검토
- **월간**: 의존성 업데이트
- **분기별**: 보안 정책 검토

---

## 다음 단계

- [문제 해결 가이드](06-TROUBLESHOOTING.md) - 보안 스캔 문제 해결
- [MCP 도구 레퍼런스](02-MCP-TOOLS-REFERENCE.md) - 전체 도구 목록
