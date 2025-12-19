# 🚀 기본 배포 예제

## 1. 간단한 React 앱 배포

```bash
# GitHub에서 React 앱 배포
codeb deploy my-react-app https://github.com/username/react-todo-app

# 결과
✅ 애플리케이션 UUID: abc123...
✅ URL: https://my-react-app.one-q.xyz
🎉 배포가 완료되었습니다!
💡 SSL 인증서 발급까지 1-2분 정도 소요될 수 있습니다.
```

## 2. 현재 폴더 배포

```bash
# 현재 작업 중인 프로젝트 배포
cd /Users/admin/my-awesome-project
git remote -v  # 원격 저장소 확인

codeb init awesome-project

# 결과
ℹ 현재 Git 저장소 사용: https://github.com/username/my-awesome-project (main 브랜치)
✅ URL: https://awesome-project.one-q.xyz
```

## 3. 브랜치 지정 배포

```bash
# 개발 브랜치로 스테이징 배포
codeb deploy staging-app https://github.com/username/my-app \
  --branch develop

# 결과
ℹ 브랜치: develop
✅ URL: https://staging-app.one-q.xyz
```

## 4. 포트 지정 배포

```bash
# 커스텀 포트 사용
codeb deploy api-server https://github.com/username/express-api \
  --port 3001

# 결과
ℹ 포트: 3001
✅ URL: https://api-server.one-q.xyz
```