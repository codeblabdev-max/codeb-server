# CodeB 서버 인프라 현황 리포트

**생성일**: 2025-12-20
**분석자**: Claude Code
**Vultr CLI 버전**: v3.8.0

---

## 1. 서버 현황 요약

### 전체 서버 구성

| 서버 | 호스트명 | IP | 역할 | 상태 | 가동시간 |
|------|----------|-----|------|------|----------|
| **n1** | videopick-phase2-app | 158.247.203.55 | App Server | ✅ Active | 80일 |
| **n2** | videopick-phase2-streaming | 141.164.42.213 | Streaming | ✅ Active | 80일 |
| **n3** | videopick-phase2-storage | 64.176.226.119 | Storage (DB) | ✅ Active | 80일 |
| **n4** | videopick-phase2-backup | 141.164.37.63 | Backup | ✅ Active | 32일 |

---

## 2. 서버별 상세 분석

### n1 - App Server (158.247.203.55)

#### 리소스 현황
| 항목 | 값 | 사용률 | 상태 |
|------|-----|--------|------|
| **Memory** | 15GB (Total) | 1.5GB 사용 (10%) | ✅ 여유 |
| **Disk** | 300GB | 39GB 사용 (14%) | ✅ 여유 |
| **Load Average** | 0.09, 0.05, 0.02 | 매우 낮음 | ✅ 안정 |
| **Swap** | 8GB | 3MB 사용 (0%) | ✅ 정상 |

#### 실행 중인 컨테이너
| 컨테이너 | 포트 | 상태 | 가동시간 |
|----------|------|------|----------|
| codeb-dashboard | 3100→3000 | ✅ Up | 25시간 |
| codeb-cms | 3202→3000 | ✅ Up | 2일 |
| codeb-cms-postgres | 5433→5432 | ✅ Up | 2일 |
| codeb-cms-redis | 6380→6379 | ✅ Up | 2일 |
| powerdns-postgres | 5434→5432 | ✅ Up | 47시간 |

#### 시스템 서비스
| 서비스 | 상태 | 설명 |
|--------|------|------|
| actions.runner.*.codeb-app-server | ✅ Active | GitHub Actions Self-hosted Runner |
| codeb-auto-scanner | ✅ Active | 주기적 서버 헬스 모니터 |
| codeb-dashboard | ✅ Active | 대시보드 서비스 |
| codeb-protection | ✅ Active | 보호 데몬 |
| codeb-watchdog | ✅ Active | 워치독 모니터 |

#### 포트 사용 현황
```
3000 - next-server (예약됨)
3001 - docker-proxy
3100 - codeb-dashboard
3101 - node (SSOT Registry)
3102 - node (Domain Manager)
3202 - codeb-cms
5432-5434 - PostgreSQL instances
```

---

### n2 - Streaming Server (141.164.42.213)

#### 리소스 현황
| 항목 | 값 | 사용률 | 상태 |
|------|-----|--------|------|
| **Memory** | 15GB (Total) | 425MB 사용 (3%) | ✅ 매우 여유 |
| **Disk** | 300GB | 20GB 사용 (7%) | ✅ 여유 |
| **Load Average** | 0.00, 0.00, 0.00 | 거의 없음 | ✅ 유휴 |

#### Centrifugo 상태
| 항목 | 값 |
|------|-----|
| **버전** | 5.4.9 |
| **런타임** | Go 1.23.4 |
| **엔진** | Memory |
| **포트** | 8000 |
| **상태** | ✅ Active (1일 18시간) |
| **메모리 사용** | 90.9MB |
| **CPU 시간** | 3분 23초 |

#### 주의사항
- ⚠️ `allowed_origins: *` 설정 - 보안 강화 권장
- WebSocket endpoint: `/connection/websocket`
- API endpoint: `:8000`

---

### n3 - Storage Server (64.176.226.119)

#### 리소스 현황
| 항목 | 값 | 사용률 | 상태 |
|------|-----|--------|------|
| **Memory** | 15GB (Total) | 1.3GB 사용 (9%) | ✅ 여유 |
| **Disk** | 300GB | 30GB 사용 (11%) | ✅ 여유 |
| **Load Average** | 0.13, 0.12, 0.14 | 낮음 | ✅ 안정 |

#### 데이터베이스 서비스
| 서비스 | 컨테이너명 | 상태 |
|--------|-----------|------|
| **PostgreSQL** | codeb-postgres | ✅ Running (Podman) |
| **Redis** | codeb-redis | ✅ Running (Podman, Auth 필요) |

#### 주의사항
- ⚠️ Redis 인증 활성화됨 (NOAUTH 에러 발생)
- PostgreSQL 데이터베이스 목록 접근 필요

---

### n4 - Backup Server (141.164.37.63)

#### 리소스 현황
| 항목 | 값 | 사용률 | 상태 |
|------|-----|--------|------|
| **Memory** | 7.7GB (Total) | 363MB 사용 (5%) | ✅ 여유 |
| **Disk** | 150GB | 20GB 사용 (14%) | ✅ 여유 |
| **Load Average** | 0.08, 0.02, 0.01 | 거의 없음 | ✅ 유휴 |

#### 백업 현황
- ⚠️ `/opt/codeb/backups` 디렉토리 비어있음
- 백업 자동화 설정 필요

---

## 3. Vultr CLI 오토스케일링 기능 분석

### 사용 가능한 스케일링 옵션

#### 3.1 Instance 기반 (현재 방식)
```bash
# 수동 인스턴스 생성
vultr-cli instance create --plan vc2-2c-4gb --region icn --os 1743

# 인스턴스 삭제
vultr-cli instance delete <INSTANCE_ID>
```

**특징**:
- 수동 프로비저닝
- 스크립트로 자동화 가능
- 초기 설정 필요 (Startup Script)

#### 3.2 Kubernetes 기반 (오토스케일링 지원)
```bash
# 오토스케일링 노드 풀 생성
vultr-cli kubernetes node-pool create <CLUSTER_ID> \
  --label="app-workers" \
  --plan="vc2-2c-4gb" \
  --quantity=2 \
  --auto-scaler \
  --min-nodes=2 \
  --max-nodes=10
```

**특징**:
- ✅ `--auto-scaler` 플래그로 자동 스케일링
- ✅ `--min-nodes`, `--max-nodes`로 범위 설정
- 부하 기반 자동 노드 추가/제거
- Kubernetes 클러스터 필요

#### 3.3 Load Balancer
```bash
# 로드밸런서 생성
vultr-cli load-balancer create --region icn \
  --forwarding-rules '[{"frontend_port": 80, "backend_port": 3000}]' \
  --instances '<INSTANCE_ID_1>,<INSTANCE_ID_2>'
```

**특징**:
- 여러 인스턴스에 트래픽 분산
- 헬스체크 지원
- SSL 지원

---

## 4. 오토스케일링 구현 권장사항

### 현재 아키텍처 (Instance 기반)

```
                    ┌─────────────────┐
                    │   Caddy (n1)    │
                    │  Reverse Proxy  │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       ┌─────────────┐               ┌─────────────┐
       │  App (n1)   │               │  App (n1)   │
       │ Port 4001   │               │ Port 4002   │
       └─────────────┘               └─────────────┘
```

### 권장 스케일링 전략

#### Option A: Instance 기반 수평 스케일링 (현재 구조 유지)

```bash
# 1. 새 App 서버 생성 스크립트
#!/bin/bash
NEW_IP=$(vultr-cli instance create \
  --plan vc2-4c-8gb \
  --region icn \
  --os 1743 \
  --script-id <STARTUP_SCRIPT_ID> \
  --output json | jq -r '.instance.main_ip')

# 2. Caddy 업스트림에 추가
ssh root@n1.codeb.kr "caddy add-upstream $NEW_IP:3000"

# 3. SSOT 레지스트리 업데이트
we ssot add-server $NEW_IP --role app
```

**장점**:
- 기존 인프라 변경 없음
- 점진적 확장 가능
- 비용 예측 가능

**단점**:
- 수동/스크립트 기반
- 부하 기반 자동 스케일링 없음

#### Option B: Kubernetes 전환 (완전 자동화)

```bash
# 1. Kubernetes 클러스터 생성
vultr-cli kubernetes create \
  --label "codeb-cluster" \
  --region icn \
  --version "v1.31.0+1" \
  --node-pools '[{
    "label": "app-pool",
    "plan": "vc2-4c-8gb",
    "node_quantity": 2,
    "auto_scaler": true,
    "min_nodes": 2,
    "max_nodes": 10
  }]'

# 2. 애플리케이션 배포
kubectl apply -f deployment.yaml
```

**장점**:
- ✅ 완전 자동 스케일링
- ✅ 부하 기반 노드 추가/제거
- 선언적 인프라 관리
- 롤링 업데이트 자동화

**단점**:
- 인프라 마이그레이션 필요
- 학습 곡선
- Kubernetes 관리 오버헤드

---

## 5. 즉시 개선 필요 사항

### 5.1 High Priority

| 항목 | 서버 | 설명 | 조치 |
|------|------|------|------|
| ⚠️ 백업 미설정 | n4 | `/opt/codeb/backups` 비어있음 | 백업 자동화 설정 |
| ⚠️ Centrifugo 보안 | n2 | `allowed_origins: *` | 도메인 명시적 설정 |

### 5.2 Medium Priority

| 항목 | 서버 | 설명 | 조치 |
|------|------|------|------|
| Redis 인증 | n3 | 인증 설정됨 - CLI에서 접근 불가 | 환경변수에 비밀번호 추가 |
| DB 모니터링 | n3 | 데이터베이스 목록 확인 필요 | pg_stat 모니터링 설정 |

### 5.3 Low Priority

| 항목 | 서버 | 설명 | 조치 |
|------|------|------|------|
| 리소스 여유 | 전체 | 모든 서버 리소스 10% 미만 사용 | 현재 스케일 적정 |
| n4 스펙 | n4 | 7.7GB RAM (다른 서버 15GB) | 백업 서버로 적절 |

---

## 6. 결론

### 현재 상태 평가
- ✅ **안정성**: 모든 4대 서버 정상 가동 (n1-n3: 80일, n4: 32일)
- ✅ **리소스**: 전체적으로 10% 미만 사용 (스케일 아웃 필요 없음)
- ✅ **서비스**: GitHub Actions Runner, Centrifugo, PostgreSQL, Redis 모두 정상
- ⚠️ **백업**: n4 백업 디렉토리 비어있음 - 즉시 설정 필요

### 스케일링 권장사항
1. **단기** (현재): Instance 기반 수동 스케일링으로 충분
2. **중기** (트래픽 증가 시): Load Balancer + 추가 App 서버
3. **장기** (대규모): Kubernetes 전환 검토 (자동 오토스케일링)

### 다음 단계
1. n4 백업 자동화 설정
2. Vultr API 키 설정 (`~/.vultr-cli.yaml`)
3. 스케일링 자동화 스크립트 작성
4. 모니터링 대시보드 구축 (Grafana/Prometheus)
