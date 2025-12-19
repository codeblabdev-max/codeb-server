# Vultr Multi-Account Management Guide

> **Last Updated**: 2025-12-18
> **관리자**: Admin

## 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Vultr Multi-Account Architecture                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────┐         ┌──────────────────────────────────┐ │
│  │  계정 1: 테스트/인프라     │         │  계정 2: 프로덕션                  │ │
│  │  cdekym77@gmail.com      │         │  jrstv.server@gmail.com          │ │
│  ├──────────────────────────┤         ├──────────────────────────────────┤ │
│  │                          │         │                                  │ │
│  │  ┌────────────────────┐  │  배포   │  ┌────────────────────────────┐  │ │
│  │  │ 141.164.60.51      │  │ ──────▶ │  │ Terraform Auto-Scaling     │  │ │
│  │  │ - PowerDNS (NS)    │  │         │  │ - App Servers              │  │ │
│  │  │ - Caddy Proxy      │  │         │  │ - Streaming Servers        │  │ │
│  │  │ - CodeB MCP        │  │         │  │ - Storage Servers          │  │ │
│  │  │ - 테스트 환경       │  │         │  │ - Backup Servers           │  │ │
│  │  └────────────────────┘  │         │  └────────────────────────────┘  │ │
│  │                          │         │                                  │ │
│  │  용도:                    │         │  용도:                           │ │
│  │  - DNS 관리              │         │  - 실제 서비스 운영               │ │
│  │  - CI/CD 테스트          │         │  - Auto-scaling                 │ │
│  │  - 개발/스테이징          │         │  - Production 배포              │ │
│  │                          │         │                                  │ │
│  └──────────────────────────┘         └──────────────────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 계정 분리 전략

| 구분 | 계정 1 (테스트/인프라) | 계정 2 (프로덕션) |
|------|----------------------|------------------|
| **이메일** | cdekym77@gmail.com | jrstv.server@gmail.com |
| **이름** | dongeun cheon | Hwang Inhoi |
| **용도** | 네임서버 + 테스트 + CI/CD | 프로덕션 서비스 |
| **관리 방식** | 수동 관리 | **Terraform Auto-Scaling** |
| **서버 수** | 1대 (고정) | 4대+ (자동 확장) |
| **배포 흐름** | 테스트 → 검증 | ← 자동 배포 |

---

## 계정 1: 테스트/인프라 (cdekym77@gmail.com)

### API Key
```
AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA
```

### 서버 목록

| ID | IP | Label | OS | CPU | RAM | Disk | Region |
|----|-----|-------|-----|-----|-----|------|--------|
| `0c099e4d-29f0-4c54-b60f-4cdd375ac2d4` | 141.164.60.51 | codeb-infra | Ubuntu 22.04 x64 | 2 | 16GB | 200GB | icn (Seoul) |

### 역할
1. **네임서버 (PowerDNS)**
   - codeb.dev, one-q.xyz 등 도메인 관리
   - DNS 레코드 자동 생성/삭제

2. **리버스 프록시 (Caddy)**
   - HTTPS 자동 인증서 관리
   - 프로덕션 서버로 트래픽 라우팅

3. **CI/CD 테스트 환경**
   - 테스트 → 검증 → 프로덕션 배포 파이프라인
   - CodeB MCP 서버 운영

4. **개발/스테이징**
   - 새 기능 테스트
   - 프로덕션 배포 전 검증

### SSH Keys 등록됨
- m2 macbook (cheon43@gmail.com)
- ed25519-key (ymn9639@gmail.com)
- sionyeom-macbook
- becky-macbook
- 전민준-macbook

---

## 계정 2: 프로덕션 (jrstv.server@gmail.com)

### API Key
```
LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA
```
> 만료일: 2026-12-17

### 현재 서버 목록

| ID | IP | Label | CPU | RAM | Disk | Role |
|----|-----|-------|-----|-----|------|------|
| `00bad969-1751-4ff7-b0ba-26e9359c0d88` | 158.247.203.55 | videopick-phase2-app | 6 | 16GB | 320GB | **App Server** |
| `56797584-ce45-4d5c-bb0f-6e47db0d2ed4` | 141.164.42.213 | videopick-phase2-streaming | 6 | 16GB | 320GB | **Streaming** |
| `5b3c19bf-a6ac-4b36-8e3a-bbef72b2c8d1` | 64.176.226.119 | videopick-phase2-storage | 6 | 16GB | 320GB | **Storage** |
| `27f996e9-7bb7-4354-b3b5-6f6234f713d1` | 141.164.37.63 | videopick-phase2-backup | 4 | 8GB | 160GB | **Backup** |

### Terraform Auto-Scaling 계획

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Production Auto-Scaling Architecture              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Load Balancer (Vultr LB)                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│              ┌───────────────┼───────────────┐                      │
│              ▼               ▼               ▼                      │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│  │ App Server 1    │ │ App Server 2    │ │ App Server N    │       │
│  │ (auto-scale)    │ │ (auto-scale)    │ │ (auto-scale)    │       │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│              │               │               │                      │
│              └───────────────┼───────────────┘                      │
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Streaming Cluster                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │   │
│  │  │ Stream 1    │  │ Stream 2    │  │ Stream N    │          │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│              ┌───────────────┴───────────────┐                      │
│              ▼                               ▼                      │
│  ┌─────────────────────────┐    ┌─────────────────────────┐        │
│  │ Storage Cluster         │    │ Backup Server           │        │
│  │ (Block Storage + NVMe)  │    │ (Daily Snapshots)       │        │
│  └─────────────────────────┘    └─────────────────────────┘        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘

Auto-Scaling Rules:
- CPU > 70% for 5 min → Scale Up
- CPU < 30% for 10 min → Scale Down
- Min: 2 instances, Max: 10 instances
```

### 관리 방식: Terraform
- **Infrastructure as Code**: 모든 서버 설정 코드화
- **Auto-Scaling**: 트래픽에 따른 자동 확장/축소
- **배포 자동화**: 테스트 서버에서 검증 후 자동 배포
- **상태 관리**: Terraform State로 인프라 추적

---

## Vultr CLI 설정

### 환경변수 방식 (권장)

```bash
# 계정 1 (CodeB)
export VULTR_API_KEY_CODEB="AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"

# 계정 2 (Videopick)
export VULTR_API_KEY_VIDEOPICK="LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA"

# 사용 예시
VULTR_API_KEY=$VULTR_API_KEY_CODEB vultr-cli instance list
VULTR_API_KEY=$VULTR_API_KEY_VIDEOPICK vultr-cli instance list
```

### Shell Alias 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
alias vultr-codeb='VULTR_API_KEY="AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA" vultr-cli'
alias vultr-videopick='VULTR_API_KEY="LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA" vultr-cli'

# 사용 예시
vultr-codeb instance list
vultr-videopick instance list
```

### 설정 파일 방식

```yaml
# ~/.vultr-cli.yaml
# 기본 계정 설정 (하나만 가능)
api-key: "AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"
```

---

## Terraform 멀티 계정 설정

### Provider 설정

```hcl
# providers.tf

# 계정 1: CodeB
provider "vultr" {
  alias   = "codeb"
  api_key = var.vultr_api_key_codeb
}

# 계정 2: Videopick
provider "vultr" {
  alias   = "videopick"
  api_key = var.vultr_api_key_videopick
}
```

### Variables

```hcl
# variables.tf
variable "vultr_api_key_codeb" {
  description = "Vultr API Key for CodeB account"
  type        = string
  sensitive   = true
}

variable "vultr_api_key_videopick" {
  description = "Vultr API Key for Videopick account"
  type        = string
  sensitive   = true
}
```

### terraform.tfvars (gitignore에 추가!)

```hcl
# terraform.tfvars
vultr_api_key_codeb     = "AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA"
vultr_api_key_videopick = "LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA"
```

---

## 빠른 참조 명령어

```bash
# 계정 1 (CodeB) - 141.164.60.51
VULTR_API_KEY="AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA" vultr-cli instance list
VULTR_API_KEY="AMB4DGAONZFB7JVUM5AL2EY7L4TSG7RUVVUA" vultr-cli account info

# 계정 2 (Videopick) - 4대 서버
VULTR_API_KEY="LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA" vultr-cli instance list
VULTR_API_KEY="LP67AR5M65XFCSUGNANWNVWWLOKGUPW2P5AA" vultr-cli account info

# SSH 접속
ssh root@141.164.60.51      # CodeB 메인
ssh root@158.247.203.55     # Videopick App
ssh root@141.164.42.213     # Videopick Streaming
ssh root@64.176.226.119     # Videopick Storage
ssh root@141.164.37.63      # Videopick Backup
```

---

## 보안 주의사항

1. **API 키 보호**: terraform.tfvars는 반드시 .gitignore에 추가
2. **키 만료**: Videopick 키는 2026-12-17 만료 예정
3. **권한 분리**: 각 계정은 독립적인 리소스 관리
4. **정기 점검**: 월 1회 서버 상태 및 비용 확인

---

## 비용 현황

| 계정 | 월 예상 비용 |
|------|-------------|
| CodeB (1대) | ~$83/월 |
| Videopick (4대) | ~$222/월 |
| **총계** | ~$305/월 |
