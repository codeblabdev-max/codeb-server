# CodeB Deployment Rules for AI Agents

> **이 파일은 Claude Code 등 AI 에이전트가 배포 시 반드시 따라야 하는 규칙입니다.**

## 🚨 절대 금지 규칙 (CRITICAL - 이 규칙 위반 시 배포 중단)

### 1. 에러 우회 금지

```bash
# ❌ 절대 금지
command || true                    # 에러 무시
command || echo "warning"          # 에러를 경고로 변환
command || exit 0                  # 에러여도 성공 처리
continue-on-error: true            # GitHub Actions 에러 무시
failed_when: false                 # Ansible 에러 무시
```

```typescript
// ❌ 절대 금지
try { riskyOperation() } catch {}           // 에러 삼키기
try { riskyOperation() } catch { return }   // 에러 무시하고 리턴
catch (e) { console.log(e) }                // 로그만 찍고 무시
```

### 2. 코드 품질 우회 금지

```typescript
// ❌ 절대 금지
// @ts-ignore
// @ts-nocheck
// eslint-disable
// eslint-disable-next-line
any                                // any 타입 사용
as any                             // any로 캐스팅
```

### 3. 인프라 우회 금지

```bash
# ❌ 절대 금지
# --network 플래그 제거 (CNI 에러 시에도)
podman run app  # 원래 --network codeb 있었으면 유지

# IP 직접 하드코딩 금지
DATABASE_URL="postgresql://10.88.0.5:5432/db"  # ❌
DATABASE_URL="postgresql://postgres:5432/db"   # ✅ 서비스명 사용

# 권한 문제 우회 금지
chmod 777 /path                    # 보안 위험
chmod -R 777 /path                 # 더 위험
--privileged                       # 컨테이너 권한 상승

# 포트 임의 변경 금지
# 3000 충돌 시 3001로 변경 ❌
# 포트 충돌 원인 해결 후 원래 포트 사용 ✅
```

### 4. 삭제로 해결 금지

```typescript
// ❌ 에러 나는 코드 삭제 금지
// 기존에 있던 함수나 로직을 삭제하여 에러를 없애면 안됨

// ❌ 테스트 skip/제거 금지
test.skip("failing test")          // skip 금지
// 테스트 파일 삭제 금지
```

---

## ✅ 허용되는 수정

### 1. 타입 추가/수정
```typescript
// ✅ 누락된 타입 정의 추가
interface UserInput {
  name: string;
  email: string;
}

// ✅ 올바른 타입 캐스팅
const user = response as User;  // 구체적 타입으로
```

### 2. 누락된 코드 추가
```typescript
// ✅ 누락된 import 추가
import { validateEmail } from '@/utils/validation';

// ✅ null/undefined 체크 추가
if (user?.email) {
  sendEmail(user.email);
}
```

### 3. 로직 버그 수정
```typescript
// ✅ 잘못된 로직 수정
// Before: if (count > 10) → After: if (count >= 10)
```

### 4. 올바른 에러 처리
```typescript
// ✅ 에러를 적절히 처리
try {
  await riskyOperation();
} catch (error) {
  logger.error('Operation failed', error);
  throw new AppError('OPERATION_FAILED', error);  // 재throw
}
```

---

## 📝 배포 시 로깅 필수

### 1. 배포 시작 시
```bash
source scripts/deployment-logger.sh
start_deployment_log "project-name" "staging"
```

### 2. MCP 도구 사용 시
```bash
log_mcp_call "deploy_compose_project" '{"projectName": "cms", "environment": "staging"}' "success"
```

### 3. 코드 수정 시
```bash
log_ai_action "BUG_FIX" "Fixed null check in user validation" "src/utils/validate.ts" "$OLD_CODE" "$NEW_CODE"
```

### 4. 에러 발생 시
```bash
log_error "prisma migrate" "Connection refused" "Checking database container status"
```

### 5. 배포 완료 시
```bash
end_deployment_log "SUCCESS"  # 또는 "FAILED"
```

---

## 🔍 에러 발생 시 올바른 대응

### CNI 네트워크 에러
```
❌ 잘못된 대응: --network 플래그 제거
✅ 올바른 대응:
1. podman network ls 로 네트워크 확인
2. podman network create codeb 로 네트워크 생성
3. 기존 컨테이너 재시작
```

### DB 연결 에러
```
❌ 잘못된 대응: || true 추가
✅ 올바른 대응:
1. DB 컨테이너 상태 확인: podman ps
2. DB 로그 확인: podman logs postgres-container
3. 네트워크 연결 확인: podman inspect postgres-container
4. pg_hba.conf 확인 및 수정
```

### 빌드 에러
```
❌ 잘못된 대응: 에러 나는 코드 삭제
✅ 올바른 대응:
1. 에러 메시지 분석
2. 타입 정의 추가 또는 수정
3. 누락된 import 추가
4. 로직 버그 수정
```

### 포트 충돌
```
❌ 잘못된 대응: 임의의 다른 포트로 변경
✅ 올바른 대응:
1. 충돌 프로세스 확인: lsof -i :3000
2. 불필요한 프로세스 종료
3. 또는 환경변수로 포트 설정 후 일관되게 사용
```

---

## 📊 배포 후 검토

### 로그 확인
```bash
# 최근 배포 로그 확인
ls -lt deployment-logs/

# 바이패스 패턴 검색
grep "BYPASS_DETECTED" deployment-logs/*.log

# 리포트 생성
source scripts/deployment-logger.sh
generate_bypass_report deployment-logs/latest.log
```

### 코드 비교
```bash
# Git diff로 AI 수정사항 확인
git diff HEAD~1

# 우회 패턴 검색
grep -rn "|| true" .
grep -rn "@ts-ignore" .
grep -rn "eslint-disable" .
```

---

## ⚙️ 설정

이 규칙들은 다음 파일에서도 적용됩니다:
- `.github/workflows/self-healing-ci.yml` - GitHub Actions Self-Healing
- `scripts/local-self-healing.sh` - 로컬 Claude Code Self-Healing
- `scripts/deployment-logger.sh` - 배포 로그 시스템

---

**마지막 업데이트:** $(date '+%Y-%m-%d')
**버전:** 1.0.0
