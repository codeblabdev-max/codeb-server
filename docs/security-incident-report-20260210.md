# 보안 사고 보고서: 크립토 마이너 감염

> **사고일시:** 2026-02-10 03:24 KST
> **발견일시:** 2026-02-10 09:45 KST
> **보고일시:** 2026-02-10
> **심각도:** CRITICAL
> **상태:** 대응 완료 (후속 조치 필요)

---

## 1. 사고 요약

App 서버(158.247.203.55)에서 실행 중인 `heeling-green` Docker 컨테이너 내부에서 **크립토 마이너 악성코드(`eBiuuDYv`)**가 발견되었습니다.

| 항목 | 내용 |
|------|------|
| **악성코드명** | `eBiuuDYv` (파일 삭제 후 메모리에서 실행) |
| **유형** | 크립토마이너 (암호화폐 채굴) |
| **CPU 사용률** | 427% (6코어 중 4.3코어 점유) |
| **메모리 사용** | 2.3GB (14.7%) |
| **스레드 수** | 11개 |
| **실행 위치** | heeling-green 컨테이너 내부 (/tmp/) |
| **실행 사용자** | nextjs (UID 1001, 컨테이너) = linuxuser (UID 1001, 호스트) |
| **악성 도메인** | `abcdefghijklmnopqrst.net` (IP: 77.110.110.55) |

---

## 2. 타임라인

```
2026-02-09 16:04 KST  heeling-green 컨테이너 시작 (재배포)
2026-02-10 03:24 KST  [1차] 악성코드 다운로드 및 실행 시도
                       → echo <base64> | base64 -d | /bin/sh
                       → 마이너 바이너리 다운로드 성공, 실행 시작
2026-02-10 05:56 KST  [2차] 악성코드 실행 재시도 (마이너 이미 동작 중)
2026-02-10 09:45 KST  보안 스캔 중 발견 (CPU 427% 이상 감지)
2026-02-10 09:46 KST  프로세스 Kill (PID 2588231)
2026-02-10 09:47 KST  heeling-green 컨테이너 정지
2026-02-10 09:50 KST  악성 도메인 차단 (4대 서버 모두)
```

---

## 3. 악성코드 분석

### 3.1 드로퍼 스크립트 (Base64 디코딩 결과)

컨테이너 로그에서 발견된 base64 인코딩된 쉘 스크립트:

```
동작 방식:
1. uname -m으로 아키텍처 확인 (x86_64 또는 aarch64)
2. http://abcdefghijklmnopqrst.net/s (x86_64) 또는 /a (aarch64)에서 바이너리 다운로드
3. 다운로드 방법: nc → wget → curl → python3 → perl (순차 시도)
4. /tmp, $PWD, $HOME 등 쓰기 가능한 디렉토리에 저장
5. chmod +x 후 nohup으로 백그라운드 실행
6. 바이너리 파일 즉시 삭제 (메모리에서만 실행)
7. 경쟁 마이너 프로세스 Kill (/dev/fd/3, sleep 패턴)
```

### 3.2 실행 환경

```
실행 위치:  /tmp (컨테이너 내부)
바이너리:   /tmp/eBiuuDYv (실행 직후 삭제됨)
실행 방식:  nohup ./eBiuuDYv > /dev/null 2>&1 &
프로세스:   PID 2588231 (호스트), 11 스레드
메모리 맵:  /proc/2588231/exe -> /tmp/eBiuuDYv (deleted)
```

---

## 4. 침투 경로 분석

### 4.1 확인된 사항

| 분석 항목 | 결과 |
|----------|------|
| SSH 패스워드 로그인 | 기록 없음 (공개키만 사용) |
| Docker API 노출 | 2375/2376 포트 미오픈 |
| docker-entrypoint.sh 변조 | 변조 없음 (정상) |
| 컨테이너 파일시스템 변경 | /tmp/ 변경 없음 (바이너리 이미 삭제) |
| 소스 코드 child_process 사용 | 없음 |
| linuxuser 계정 SSH 로그인 | 없음 (패스워드 잠금 상태) |
| Docker 이미지 레이어 | 변조 없음 |

### 4.2 공격 벡터 (추정)

컨테이너 로그에서 발견된 에러 메시지:
```
⨯ Error: Command failed: echo <base64> | base64 -d | /bin/sh
    at ignore-listed frames {
  status: null,
  signal: 'SIGKILL',
  output: [Array],
  pid: 60,
  stdout: <Buffer>,
  stderr: <Buffer>,
  digest: '1933122266'
}
```

이 에러 형식은 Node.js `child_process.execSync()` 실패 출력입니다.
그러나 앱 소스 코드에는 `child_process` 직접 사용이 **전혀 없습니다**.

**가장 유력한 공격 경로 (우선순위 순):**

1. **npm 공급망 공격 (Supply Chain Attack)**
   - `bcryptjs@3.0.3` 등 의존성 패키지가 빌드 시 트로이 목마 코드 주입
   - 컴파일된 `.next/server/` 청크에 악성 코드가 번들링됨
   - `digest: '1933122266'` 필드는 표준 Node.js에 없는 비정상 필드

2. **취약한 Cron 엔드포인트를 통한 원격 코드 실행 (RCE)**
   - `/api/cron/schedules` 엔드포인트: `X-Cron-Secret: heeling-cron-secret-2024` (약한 시크릿)
   - `/api/admin/generate/callback` 엔드포인트: **인증 없음**
   - 외부에서 악성 페이로드를 주입할 수 있는 잠재적 벡터

3. **Node.js/Next.js 취약점을 통한 RCE**
   - Next.js 16.0.3, Node.js 20.19.6 런타임 취약점 가능성
   - 조작된 HTTP 요청을 통한 임의 코드 실행

---

## 5. 유출된 시크릿 키 목록

**컨테이너 환경변수가 프로세스 정보를 통해 노출되었습니다.**
악성코드가 실행되는 동안 `/proc/<PID>/environ`을 통해 모든 환경변수에 접근 가능했습니다.

| 시크릿 | 유형 | 상태 |
|--------|------|------|
| `DATABASE_URL` (heeling_user 비밀번호) | PostgreSQL 접속 정보 | **유출됨** |
| `FIREBASE_PRIVATE_KEY` (RSA 전체) | Firebase Admin SDK | **유출됨** |
| `FIREBASE_CLIENT_EMAIL` | Firebase 서비스 계정 | **유출됨** |
| `NEXTAUTH_SECRET` | 세션 암호화 키 | **유출됨** |
| `CRON_SECRET` | 크론 작업 인증 | **유출됨** |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | 스토리지 접근 키 | **유출됨** |

---

## 6. 완료된 대응 조치

### 6.1 즉시 대응
- [x] 악성 프로세스 Kill (PID 2588231)
- [x] heeling-green 컨테이너 정지
- [x] 악성 도메인 차단 (iptables + /etc/hosts, 4대 서버)

### 6.2 SSH 보안 강화 (사고 이전 적용)
- [x] PasswordAuthentication 비활성화 (4대 서버)
- [x] PermitRootLogin prohibit-password (4대 서버)
- [x] fail2ban 설치 및 구성 (4대 서버)
- [x] 공격 IP 5개 영구 차단

---

## 7. 후속 조치 (필수)

### 7.1 즉시 (24시간 내)

| 순서 | 조치 | 담당 |
|------|------|------|
| 1 | **DB 비밀번호 변경** - heeling_user 비밀번호 교체 | 인프라팀 |
| 2 | **Firebase 키 재생성** - Firebase Console에서 새 서비스 계정 키 발급 | 개발팀 |
| 3 | **NEXTAUTH_SECRET 교체** - 새 랜덤 시크릿 생성 | 개발팀 |
| 4 | **CRON_SECRET 교체** - 강력한 랜덤 시크릿으로 변경 | 개발팀 |
| 5 | **MinIO 키 교체** - ACCESS_KEY / SECRET_KEY 재생성 | 인프라팀 |

### 7.2 단기 (1주 내)

| 순서 | 조치 |
|------|------|
| 1 | **npm audit** - 모든 의존성 취약점 스캔 |
| 2 | **bcryptjs 버전 확인** - 3.0.3 버전이 malicious인지 npm advisory 확인 |
| 3 | **Callback 엔드포인트 인증 추가** - `/api/admin/generate/callback`에 인증 추가 |
| 4 | **CRON_SECRET 강화** - UUID v4 등 추측 불가능한 시크릿 사용 |
| 5 | **컨테이너 보안 강화** - read-only rootfs, no-new-privileges, seccomp |
| 6 | **빌드 파이프라인 감사** - GHCR 이미지 무결성 검증 |

### 7.3 중기 (1개월 내)

| 순서 | 조치 |
|------|------|
| 1 | **컨테이너 런타임 보안** - AppArmor/seccomp 프로필 적용 |
| 2 | **네트워크 정책** - 컨테이너 아웃바운드 트래픽 제한 |
| 3 | **런타임 모니터링** - Falco 등 컨테이너 런타임 보안 도구 도입 |
| 4 | **정기 보안 스캔** - 주간 npm audit + Docker 이미지 스캔 |
| 5 | **시크릿 관리** - 환경변수 대신 Docker Secrets 또는 Vault 사용 |

---

## 8. 권장 Docker 보안 설정

```bash
# heeling 컨테이너 재시작 시 보안 옵션
docker run \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  --security-opt=no-new-privileges:true \
  --cap-drop=ALL \
  --cap-add=NET_BIND_SERVICE \
  --pids-limit=100 \
  --memory=1g \
  --cpus=2 \
  --network=heeling-net \
  heeling-green
```

핵심 보안 설정:
- `--read-only`: 컨테이너 파일시스템 읽기 전용
- `--tmpfs /tmp:noexec`: /tmp에 실행 권한 제거
- `--no-new-privileges`: 권한 상승 차단
- `--cap-drop=ALL`: 모든 Linux 능력 제거
- `--pids-limit`: 프로세스 수 제한
- `--memory/--cpus`: 리소스 제한

---

## 9. 영향 범위

| 시스템 | 영향 |
|--------|------|
| App 서버 CPU | 03:24~09:46 약 6시간 동안 CPU 427% 점유 |
| heeling DB | 비밀번호 유출 - 외부 접근 가능성 (DB 포트 노출 시) |
| Firebase | 서비스 계정 키 유출 - 무단 Firebase 접근 가능 |
| MinIO 스토리지 | 접근 키 유출 - 데이터 유출 가능성 |
| 다른 서버 3대 | 직접 영향 없음 (악성코드 미발견) |

---

## 10. 교훈

1. **약한 시크릿 사용 금지** - `heeling-cron-secret-2024`처럼 추측 가능한 시크릿은 위험
2. **인증 없는 엔드포인트 금지** - 모든 API에 적절한 인증 필수
3. **컨테이너 보안 기본값** - read-only rootfs, noexec tmpfs는 기본으로 적용
4. **환경변수 보호** - 시크릿은 환경변수가 아닌 전용 시크릿 관리 도구 사용
5. **의존성 보안** - npm audit 정기 실행, lockfile 무결성 검증
6. **아웃바운드 트래픽 제한** - 컨테이너에서 불필요한 외부 통신 차단
