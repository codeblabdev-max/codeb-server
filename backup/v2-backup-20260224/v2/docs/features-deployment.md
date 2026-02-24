# @codeb/feature-deployment

> Blue-Green 배포 - Deploy, Promote, Rollback, Slot 관리, Caddy 설정

## 역할

Docker 컨테이너 기반 Blue-Green 배포 전체 라이프사이클을 관리한다.
비활성 슬롯에 배포 → Preview URL → Promote(트래픽 전환) → 이전 슬롯 Grace 상태.

## 디렉토리 구조

```
features/deployment/src/
├── deploy.service.ts    ← 배포 실행 (Docker pull/run)
├── promote.service.ts   ← 트래픽 전환 (Caddy 설정 변경)
├── rollback.service.ts  ← 이전 버전 복원
├── slot.service.ts      ← 슬롯 상태 조회/관리/정리
├── caddy.service.ts     ← Caddy 리버스 프록시 설정
├── types.ts             ← 입출력 타입 정의
└── index.ts
```

## Services

### DeployService

비활성 슬롯을 찾아 새 버전을 배포한다.

| 주요 메서드 | 설명 |
|------------|------|
| `deploy(input: DeployInput)` | 전체 배포 파이프라인 실행 |

**배포 파이프라인 단계:**
1. 프로젝트 정보 조회 (DB)
2. 비활성 슬롯 결정 (blue/green)
3. Docker 이미지 Pull
4. 기존 컨테이너 정지/제거
5. 새 컨테이너 생성 (보안 옵션 적용)
6. 헬스체크 대기
7. 슬롯 상태 업데이트 → `deployed`
8. Preview URL 반환

**컨테이너 보안 옵션:**
- `--read-only` (읽기 전용 파일시스템)
- `--tmpfs /tmp:noexec` (실행 불가 tmpfs)
- `--cap-drop=ALL` (모든 Linux capability 제거)
- `--no-new-privileges` (권한 상승 방지)

### PromoteService

배포된 슬롯으로 트래픽을 전환한다.

| 주요 메서드 | 설명 |
|------------|------|
| `promote(input: PromoteInput)` | 트래픽 전환 실행 |

**전환 흐름:**
1. 현재 active 슬롯 확인
2. deployed 상태의 슬롯 확인
3. Caddy 설정 업데이트 (upstream 변경)
4. Caddy reload
5. 새 슬롯 → `active`, 이전 슬롯 → `grace`

### RollbackService

Grace 상태의 이전 슬롯으로 즉시 복원한다.

| 주요 메서드 | 설명 |
|------------|------|
| `rollback(input: RollbackInput)` | 롤백 실행 |

### SlotService

슬롯 상태 조회, 목록, 정리를 담당한다.

| 주요 메서드 | 설명 |
|------------|------|
| `getStatus(projectName, env)` | 슬롯 상태 조회 |
| `list(projectName?)` | 슬롯 목록 |
| `cleanup(projectName)` | grace 만료 슬롯 정리 |

### CaddyService

Caddy 리버스 프록시 설정 파일을 생성/관리한다.

| 주요 메서드 | 설명 |
|------------|------|
| `generateConfig(project, slot)` | Caddy 설정 파일 생성 |
| `reload()` | Caddy 설정 검증 + 리로드 |
| `getUpstreams(project)` | 현재 upstream 목록 |

**설정 파일 경로:** `/etc/caddy/sites/{project}-{env}.caddy`

## 타입 정의 (types.ts)

```typescript
interface DeployInput {
  projectName: string;
  environment: 'staging' | 'production';
  version?: string;
  image?: string;
}

interface DeployResult {
  success: boolean;
  projectName: string;
  slot: string;        // 'blue' | 'green'
  previewUrl?: string;
  steps: DeployStep[];
}

interface PromoteInput { projectName: string; environment: string; }
interface RollbackInput { projectName: string; environment: string; }
```

## 슬롯 상태 다이어그램

```
empty → deployed → active → grace (48시간 후 정리)
                      ↑         │
                      └─────────┘ (rollback)
```

## 의존성

- `@codeb/shared` - 타입, 상수
- `@codeb/db` - ProjectRepo, SlotRepo, DeploymentRepo
- `@codeb/ssh` - 원격 Docker 명령 실행
- `@codeb/logger` - 배포 로깅
