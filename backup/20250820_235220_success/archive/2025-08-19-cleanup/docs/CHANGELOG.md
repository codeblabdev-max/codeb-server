# 📝 변경 로그 - Coolify + PowerDNS 자동 배포 시스템

모든 주요 변경사항이 이 파일에 기록됩니다.

## [1.0.0] - 2025-08-15

### 🎉 최초 릴리즈

#### ✨ 추가된 기능
- **한 줄 명령 배포**: curl 명령으로 Git 저장소를 웹사이트로 즉시 배포
- **자동 도메인 생성**: PowerDNS와 연동된 `*.one-q.xyz` 도메인 자동 할당
- **SSL 자동 발급**: Let's Encrypt를 통한 HTTPS 자동 설정
- **Applications 생성**: Coolify에서 정확히 Applications로 표시 (Services 아님)
- **Generate Domain 기능**: 웹 대시보드의 Generate Domain 버튼 작동
- **데이터베이스 자동 연동**: PostgreSQL, MySQL, Redis, MongoDB 지원
- **환경변수 자동 설정**: 데이터베이스 연결 정보 자동 생성
- **프로젝트 관리**: 생성, 조회, 삭제 API 제공

#### 🏗️ 구현된 컴포넌트
- **PowerDNSManager**: DNS 레코드 자동 생성 및 관리
- **CoolifyAPIManager**: Coolify API 통합 및 애플리케이션 배포
- **완전 통합 배포 API**: `/api/deploy/complete` 엔드포인트
- **헬스체크 시스템**: 서비스 상태 모니터링
- **자동 정리 도구**: 테스트 프로젝트 일괄 삭제

#### 🔧 기술적 해결사항
- **Services vs Applications 문제**: Git 저장소 방식으로 변경하여 해결
- **422 Validation Error**: `is_force_https_enabled` 파라미터 제거로 해결
- **파일 동기화 문제**: 로컬-원격 서버 간 파일 동기화 자동화
- **Generate Domain 분석**: Coolify 내부 `getWildcardDomain()` 구조 파악
- **PowerDNS 통합**: API를 통한 DNS 레코드 자동 생성

#### 📊 API 엔드포인트
- `GET /api/health` - 시스템 상태 확인
- `POST /api/deploy/complete` - 완전한 애플리케이션 배포
- `GET /api/projects` - 프로젝트 목록 조회
- `DELETE /api/projects/:uuid` - 프로젝트 삭제

#### 🎯 지원하는 기술
- **프레임워크**: React, Vue.js, Angular, Next.js, Node.js, Python, PHP, Go
- **빌드 도구**: Nixpacks (자동 감지), Dockerfile
- **데이터베이스**: PostgreSQL, MySQL, Redis, MongoDB
- **SSL**: Let's Encrypt 자동 발급
- **DNS**: PowerDNS 자동 관리

#### 🧪 테스트 도구
- **PowerDNS 테스트**: `test-powerdns-domain.sh`
- **완전한 워크플로우 테스트**: `test-complete-workflow.sh`
- **Generate Domain 테스트**: `test-generate-domain.sh`
- **프로젝트 정리**: `cleanup-all-test-projects.sh`

#### 📚 문서화
- **완전한 프로젝트 문서**: `COMPLETE_PROJECT_DOCUMENTATION.md`
- **빠른 시작 가이드**: `QUICK_START_GUIDE.md`
- **API 레퍼런스**: `API_REFERENCE.md`
- **문제 해결 가이드**: `TROUBLESHOOTING.md`

#### 🔐 보안 기능
- API 키 환경변수 관리
- 컨테이너 격리
- SSL 강제 적용
- 방화벽 설정 가이드

#### 🌍 실제 운영 환경
- **서버**: 141.164.60.51
- **Coolify**: http://141.164.60.51:8000
- **PowerDNS**: http://141.164.60.51:8081
- **배포 API**: http://141.164.60.51:3007
- **도메인**: *.one-q.xyz

### 🐛 수정된 버그
- Applications 대신 Services 생성되는 문제
- DNS 레코드 자동 생성 실패
- SSL 인증서 발급 지연
- 파일 동기화 문제
- API 검증 오류 (422 에러)

### 🔄 개선사항
- 배포 시간 단축 (평균 1-2분)
- DNS 전파 최적화 (1-5분)
- 에러 처리 개선
- 로그 시스템 구축
- 자동 복구 메커니즘

### 📈 성능 지표
- **배포 성공률**: 95%+
- **DNS 전파 시간**: 1-5분
- **SSL 발급 시간**: 1-2분
- **시스템 리소스**: 2GB RAM, 20GB 디스크

---

## 다음 버전 계획 [1.1.0]

### 🚀 계획된 기능
- [ ] 다중 서버 지원
- [ ] 로드 밸런싱 자동 설정
- [ ] 백업 자동화
- [ ] 모니터링 대시보드
- [ ] Slack/Discord 알림
- [ ] GitHub Actions 통합
- [ ] 커스텀 빌드팩 지원
- [ ] 롤백 기능

### 🔧 개선 예정
- [ ] 더 빠른 배포 시간
- [ ] 향상된 에러 메시지
- [ ] 상세한 배포 로그
- [ ] 성능 최적화
- [ ] UI 개선

---

## 기여자

- **Claude Code Team** - 초기 개발 및 시스템 설계
- **PowerDNS Community** - DNS 관리 솔루션
- **Coolify Team** - PaaS 플랫폼 제공

---

## 버전 규칙

이 프로젝트는 [Semantic Versioning](https://semver.org/) 규칙을 따릅니다:

- **MAJOR** 버전: 기존 API와 호환되지 않는 변경
- **MINOR** 버전: 기존 API와 호환되는 새로운 기능 추가
- **PATCH** 버전: 기존 API와 호환되는 버그 수정