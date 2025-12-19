#!/bin/bash
# =============================================================================
# 로컬 Self-Healing 스크립트 (Claude Code Max 사용)
# =============================================================================
# 목적: 빌드 에러 발생 시 Claude Code로 자동 수정
# 사용: bash scripts/local-self-healing.sh
# 요구사항: Claude Code Max 구독
# =============================================================================

set -e

# 색상 정의
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 CodeB Self-Healing (Local - Claude Code Max)${NC}"
echo "=================================================="

# 에러 로그 파일
ERROR_LOG="./self-healing-error.log"
FIX_PROMPT="./self-healing-prompt.md"

# 빌드 단계 실행 함수
run_step() {
    local step_name="$1"
    local command="$2"

    echo -e "\n${YELLOW}▶ $step_name${NC}"

    if eval "$command" 2>&1 | tee -a "$ERROR_LOG"; then
        echo -e "${GREEN}✅ $step_name 성공${NC}"
        return 0
    else
        echo -e "${RED}❌ $step_name 실패${NC}"
        return 1
    fi
}

# 에러 로그 초기화
> "$ERROR_LOG"

# 빌드 단계 실행
FAILED_STEP=""

echo -e "\n${BLUE}📋 빌드 단계 실행 중...${NC}"

if ! run_step "TypeCheck" "npm run typecheck 2>&1"; then
    FAILED_STEP="TypeCheck"
elif ! run_step "Lint" "npm run lint 2>&1"; then
    FAILED_STEP="Lint"
elif ! run_step "Build" "npm run build 2>&1"; then
    FAILED_STEP="Build"
elif ! run_step "Test" "npm run test 2>&1"; then
    FAILED_STEP="Test"
fi

# 모든 단계 성공
if [ -z "$FAILED_STEP" ]; then
    echo -e "\n${GREEN}🎉 모든 빌드 단계 성공!${NC}"
    rm -f "$ERROR_LOG" "$FIX_PROMPT"
    exit 0
fi

# 에러 발생 - Claude Code 프롬프트 생성
echo -e "\n${YELLOW}🤖 Claude Code 수정 프롬프트 생성 중...${NC}"

cat > "$FIX_PROMPT" << 'PROMPT_HEADER'
# Self-Healing 요청

## 절대 금지 규칙 (이 규칙을 어기면 수정 거부)

### 코드 품질 관련
1. ❌ 코드를 삭제하여 문제를 해결하지 마세요
2. ❌ 테스트를 skip하거나 제거하지 마세요
3. ❌ @ts-ignore, @ts-nocheck 추가 금지
4. ❌ eslint-disable 추가 금지
5. ❌ any 타입 사용 금지
6. ❌ console.log로 디버깅하지 마세요

### 에러 우회 관련 (매우 중요!)
7. ❌ || true 로 명령 실패를 무시하지 마세요
8. ❌ || echo "warning" 으로 에러를 경고로 바꾸지 마세요
9. ❌ try-catch로 에러를 삼키지 마세요 (반드시 재throw 또는 적절한 처리)
10. ❌ continue-on-error: true 사용 금지
11. ❌ failed_when: false 사용 금지
12. ❌ 네트워크/DB 연결 실패를 무시하고 진행하지 마세요
13. ❌ 설정 파일 없음을 기본값으로 대체하지 마세요
14. ❌ "fallback" 이라는 이름으로 다른 방식으로 우회하지 마세요

### 인프라 관련
15. ❌ 네트워크 에러 시 --network 플래그를 제거하지 마세요
16. ❌ IP 직접 하드코딩으로 DNS/서비스 디스커버리 우회 금지
17. ❌ 포트 충돌 시 임의의 다른 포트로 변경하지 마세요
18. ❌ 권한 에러 시 chmod 777 또는 --privileged 사용 금지

## 허용되는 수정
1. ✅ 타입 정의 추가/수정 (interface, type 생성)
2. ✅ 누락된 import 추가
3. ✅ 로직 버그 수정 (올바른 로직으로 교체)
4. ✅ 테스트 assertion 수정 (기대값이 잘못된 경우)
5. ✅ 누락된 파일/함수 생성
6. ✅ 올바른 타입 캐스팅 추가
7. ✅ null/undefined 체크 추가

## 에러 로그
```
PROMPT_HEADER

cat "$ERROR_LOG" >> "$FIX_PROMPT"

cat >> "$FIX_PROMPT" << 'PROMPT_FOOTER'
```

## 요청
위 에러를 분석하고 수정해주세요. 수정 후 다시 빌드가 성공하도록 해주세요.
PROMPT_FOOTER

echo -e "${GREEN}✅ 프롬프트 생성 완료: $FIX_PROMPT${NC}"

# Claude Code 실행 안내
echo -e "\n${BLUE}=================================================="
echo -e "📌 Claude Code Max로 수정하기"
echo -e "==================================================${NC}"
echo ""
echo -e "방법 1: Claude Code에서 직접 실행"
echo -e "  ${YELLOW}claude \"$(cat $FIX_PROMPT)\"${NC}"
echo ""
echo -e "방법 2: 프롬프트 파일 참조"
echo -e "  ${YELLOW}claude < $FIX_PROMPT${NC}"
echo ""
echo -e "방법 3: VSCode에서 Claude Code 확장 사용"
echo -e "  1. $FIX_PROMPT 파일 열기"
echo -e "  2. 내용 복사 후 Claude Code에 붙여넣기"
echo ""
echo -e "${YELLOW}⚠️  수정 후 다시 실행: bash scripts/local-self-healing.sh${NC}"
