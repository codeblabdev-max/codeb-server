---
name: we:rollback
description: "롤백", "rollback", "되돌리기", "이전 버전" 등의 요청 시 자동 활성화. 즉시 이전 버전으로 롤백합니다.
---

# we:rollback - 즉시 롤백

## 활성화 키워드
- 롤백, rollback
- 되돌리기, 되돌려
- 이전 버전, previous version
- 배포 취소

## 사용 도구
- `mcp__codeb-deploy__rollback` - 이전 버전으로 롤백
- `mcp__codeb-deploy__slot_status` - 슬롯 상태 확인

## 롤백 절차

### 1단계: 현재 슬롯 상태 확인
```
mcp__codeb-deploy__slot_status {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

### 2단계: 롤백 실행
```
mcp__codeb-deploy__rollback {
  "projectName": "프로젝트명",
  "environment": "production"
}
```

## Blue-Green 롤백 원리
```
현재 상태:
  Blue  (active)  - v2.0.0
  Green (grace)   - v1.9.0

롤백 후:
  Blue  (grace)   - v2.0.0
  Green (active)  - v1.9.0
```

## 롤백 특징
- **즉시 전환**: Caddy 설정 변경만으로 트래픽 전환
- **무중단**: 서비스 중단 없이 롤백
- **안전**: 이전 버전이 grace 상태로 48시간 유지

## 주의사항
- Grace 슬롯이 없으면 롤백 불가
- DB 마이그레이션은 별도 복구 필요
- 환경변수 변경은 자동 복구되지 않음

## 관련 스킬
- `we:deploy` - 다시 배포
- `we:health` - 롤백 후 상태 확인
