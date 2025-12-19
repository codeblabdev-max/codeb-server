# CodeB Server 프로젝트 현황
## 2025-08-20 23:00 KST

---

## 📊 현재 실행 중인 프로젝트

| 프로젝트 | 포트 | 상태 | 도메인 | 문제점 |
|---------|------|------|--------|--------|
| test-nextjs | 4001 | Degraded | test-nextjs.codeb.one-q.xyz | 알 수 없음 |
| video-platform | 4002 | Running | video-platform.codeb.one-q.xyz | 정상 작동 |
| celly-creative | 4004 | Failed | celly-creative.codeb.one-q.xyz | 빌드 누락, 보안 차단, CORS 에러 |

---

## 🔧 시스템 구성

### 서버 정보
- **API 서버**: 141.164.60.51:3008
- **웹 서버**: Caddy (HTTPS)
- **컨테이너**: Podman
- **도메인**: *.codeb.one-q.xyz

### 아키텍처
```
Client → Caddy (443) → Podman Pod → App Container (3000)
                                  → PostgreSQL (5432)
                                  → Redis (6379)
```

---

## ❌ 주요 문제점

### 1. celly-creative 프로젝트 실패
- **증상**: 403 Forbidden, 502 Bad Gateway
- **원인**: 
  - Production 빌드 누락
  - 보안 미들웨어가 curl/모니터링 차단
  - CORS 설정 불일치
  - 데이터베이스 seed 미실행

### 2. 시스템 전반
- **배포 자동화 불완전**: 빌드 단계 누락
- **에러 복구 없음**: 실패 시 재시작 루프
- **모니터링 부족**: 헬스체크 없음

---

## ✅ 작동하는 기능

1. **Pod 생성 및 관리** ✓
2. **포트 할당 및 매핑** ✓
3. **도메인 설정 (Caddy)** ✓
4. **PostgreSQL/Redis 통합** ✓
5. **Git 클론 및 코드 배포** ✓
6. **기본 로그 조회** ✓

---

## 🚫 작동하지 않는 기능

1. **Next.js 프로덕션 빌드** ✗
2. **보안 설정 (과도함)** ✗
3. **CORS 설정** ✗
4. **데이터베이스 시드** ✗
5. **에러 복구** ✗
6. **exec 명령 (CLI)** ✗

---

## 📝 즉시 수정 필요

### celly-creative 복구 절차
```bash
# 1. 컨테이너 재생성 (영구 실행)
ssh root@141.164.60.51 << 'EOF'
podman rm -f celly-creative-app
podman run -d --name celly-creative-app \
  --pod celly-creative-pod \
  -v celly-creative-data:/app \
  node:20-alpine tail -f /dev/null
EOF

# 2. 코드 및 의존성
ssh root@141.164.60.51 << 'EOF'
podman exec celly-creative-app sh -c '
  cd /app
  git clone https://github.com/dungeun/celly-creative.git .
  npm install --legacy-peer-deps
'
EOF

# 3. 환경변수 설정
ssh root@141.164.60.51 << 'EOF'
podman exec celly-creative-app sh -c '
cat > /app/.env << EOL
DATABASE_URL=postgresql://user:password@localhost:5432/celly-creative
DIRECT_URL=postgresql://user:password@localhost:5432/celly-creative
NEXT_PUBLIC_API_URL=https://celly-creative.codeb.one-q.xyz
NODE_ENV=production
DISABLE_BOT_PROTECTION=true
ALLOWED_ORIGINS=https://celly-creative.codeb.one-q.xyz
EOL
'
EOF

# 4. 빌드 및 데이터베이스
ssh root@141.164.60.51 << 'EOF'
podman exec celly-creative-app sh -c '
  cd /app
  npx prisma db push --accept-data-loss
  npm run build
'
EOF

# 5. 실행
ssh root@141.164.60.51 << 'EOF'
podman exec -d celly-creative-app sh -c 'cd /app && npm start'
EOF
```

---

## 🎯 개선 로드맵

### Phase 1: 안정화 (1주)
- [ ] 배포 API에 빌드 단계 추가
- [ ] 환경별 보안 설정 분리
- [ ] CORS 동적 설정
- [ ] 헬스체크 구현
- [ ] exec 명령 CLI 추가

### Phase 2: 기능 확장 (2주)
- [ ] 환경변수 관리 API
- [ ] 데이터베이스 관리 명령
- [ ] 로그 스트리밍
- [ ] 백업/복원 기능

### Phase 3: 최적화 (1개월)
- [ ] CI/CD 파이프라인
- [ ] 모니터링 대시보드
- [ ] 오토 스케일링
- [ ] 로드 밸런싱

---

## 📂 파일 구조

### 핵심 파일
```
codeb-server/
├── codeb-api-server.js    # API 서버 (수정 필요)
├── codeb-cli-v2.sh        # CLI 도구 (확장 필요)
├── env-templates.json     # 환경변수 템플릿
└── docs/
    ├── PROBLEM_ANALYSIS_REPORT.md
    ├── PROJECT_STATUS.md  # 이 문서
    └── *.md               # 기타 문서들
```

### 아카이브
```
archive/
├── old-docs-20250820/     # 오래된 문서
└── old-scripts-20250820/  # 오래된 스크립트
```

---

## 🔗 참고 링크

- API 서버: http://141.164.60.51:3008/api/health
- 프로젝트 목록: http://141.164.60.51:3008/api/projects
- GitHub: https://github.com/dungeun/celly-creative

---

## 📞 다음 단계

1. **즉시**: celly-creative 수동 복구
2. **오늘**: API 서버 빌드 단계 추가
3. **이번 주**: CLI exec 명령 구현
4. **다음 주**: 전체 시스템 리팩토링 계획 수립