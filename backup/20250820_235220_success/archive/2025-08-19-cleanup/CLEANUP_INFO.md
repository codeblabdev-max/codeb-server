# 📁 2025-08-19 폴더 정리 작업

## 🎯 정리 목적
복잡하고 사용하지 않는 폴더들을 백업으로 이동하여 프로젝트 구조를 깔끔하게 정리

## 📦 이동된 폴더들

### folders/ 디렉토리에 보관된 폴더들:
- `backups/` - 이전 백업 파일들
- `cli-package/` - CLI 패키징 관련 파일들
- `codeb-server/` - 빈 폴더
- `config/` - 설정 파일들
- `docs/` - 상세 문서들 (analysis/, guides/, lxd/, planning/, reports/ 등)
- `infrastructure/` - Terraform 인프라 코드
- `scripts/` - 자동화 스크립트들 (automation/, backup/, deployment/ 등)
- `server-api/` - 테스트용 API 서버들
- `templates/` - 템플릿 파일들

### docs/ 디렉토리에 보관된 문서들:
- `COMPLETE_PROJECT_DOCUMENTATION.md`
- `DEPLOYMENT_REPORT.md`
- `PROJECT_README.md`
- `PROJECT_SUMMARY.md`
- `CHANGELOG.md`
- `deployment.log`
- `setup-local.sh`

## ✨ 정리 후 남겨진 핵심 파일들:
- `USER_MANUAL.md` - 사용자 메뉴얼 (가장 중요!)
- `QUICK_START_GUIDE.md` - 빠른 시작 가이드
- `TROUBLESHOOTING.md` - 문제 해결 가이드
- `API_REFERENCE.md` - API 참조서
- `codeb-remix/` - 웹 서버 (메인)
- `codeb-cli/` - CLI 도구
- `docker-compose.yml` - 로컬 개발용
- `Makefile` - 편의 명령어들
- `install.sh` - 서버 설치 스크립트
- `README.md` - 프로젝트 메인 페이지

## 🔄 복원 방법
필요한 파일이나 폴더가 있다면:

```bash
# 특정 폴더 복원
cp -r archive/2025-08-19-cleanup/folders/[폴더명] .

# 특정 문서 복원
cp archive/2025-08-19-cleanup/docs/[파일명] .

# 전체 복원 (권장하지 않음)
cp -r archive/2025-08-19-cleanup/folders/* .
cp -r archive/2025-08-19-cleanup/docs/* .
```

## 📅 정리 정보
- **정리 날짜**: 2025-08-19
- **정리 이유**: 폴더 구조가 복잡해서 사용자가 혼란스러워함
- **상태**: ✅ 완료
- **백업 위치**: `/Users/admin/new_project/codeb-server/archive/2025-08-19-cleanup/`

---

*이 파일은 정리 작업의 기록을 위해 자동 생성되었습니다.*