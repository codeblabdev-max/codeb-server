# 🚀 빠른 시작 가이드 - Coolify + PowerDNS 자동 배포

## ⚡ 5분 안에 시작하기

### 1. 즉시 배포하기

```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "my-test-app",
    "gitRepository": "https://github.com/dungeun/coolify-nextjs-login-app"
  }'
```

### 2. 결과 확인

- **웹사이트**: https://my-test-app.one-q.xyz
- **대시보드**: http://141.164.60.51:8000
- **DNS 확인**: `dig +short my-test-app.one-q.xyz`

## 📝 자주 사용하는 명령어

### 기본 배포
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "your-app-name",
    "gitRepository": "https://github.com/username/repo"
  }'
```

### 데이터베이스 포함 배포
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "fullstack-app",
    "gitRepository": "https://github.com/username/repo",
    "databases": [{"name": "main", "type": "postgresql"}]
  }'
```

### 환경변수 포함 배포
```bash
curl -X POST "http://141.164.60.51:3007/api/deploy/complete" \
  -H "Content-Type: application/json" \
  -d '{
    "projectName": "production-app",
    "gitRepository": "https://github.com/username/repo",
    "environmentVariables": [
      {"key": "NODE_ENV", "value": "production"},
      {"key": "API_KEY", "value": "your-secret-key"}
    ]
  }'
```

## 🛠️ 유용한 도구들

### 상태 확인
```bash
# 서비스 상태
curl http://141.164.60.51:3007/api/health

# 프로젝트 목록
curl http://141.164.60.51:3007/api/projects
```

### DNS 확인
```bash
# DNS 레코드 확인
dig +short your-app.one-q.xyz

# PowerDNS API 확인
curl -H "X-API-Key: 20a89ca50a07cc62fa383091ac551e057ab1044dd247480002b5c4a40092eed5" \
  "http://141.164.60.51:8081/api/v1/servers/localhost/zones/one-q.xyz./rrsets"
```

### 프로젝트 삭제
```bash
curl -X DELETE "http://141.164.60.51:3007/api/projects/project-uuid"
```

## 🎯 주요 엔드포인트

- **배포**: `POST /api/deploy/complete`
- **상태**: `GET /api/health`
- **프로젝트**: `GET /api/projects`
- **삭제**: `DELETE /api/projects/:uuid`

## 📱 대시보드 접근

- **Coolify**: http://141.164.60.51:8000
- **PowerDNS**: http://141.164.60.51:8081

## 🔧 지원 프레임워크

- React, Vue.js, Angular, Next.js
- Node.js, Python, PHP, Go
- Static sites (HTML/CSS/JS)

## 🗄️ 지원 데이터베이스

- PostgreSQL, MySQL, Redis, MongoDB

## ⚠️ 주의사항

1. **프로젝트 이름**: 영문, 숫자, 하이픈만 사용
2. **도메인**: 자동으로 `project-name.one-q.xyz` 생성
3. **SSL**: 자동 발급 (1-2분 소요)
4. **DNS 전파**: 최대 5분 소요

## 🐛 문제 해결

### DNS 전파 확인
```bash
dig +short your-app.one-q.xyz
# 결과: 141.164.60.51
```

### SSL 인증서 확인
```bash
curl -I https://your-app.one-q.xyz
# 결과: HTTP/2 200 (성공)
```

### 로그 확인
```bash
# Coolify 로그
ssh root@141.164.60.51 "docker logs coolify"

# 배포 서버 로그  
ssh root@141.164.60.51 "pm2 logs"
```

## 📞 도움이 필요하다면

1. **대시보드**: http://141.164.60.51:8000에서 실시간 로그 확인
2. **문서**: [완전한 문서](./COMPLETE_PROJECT_DOCUMENTATION.md) 참조
3. **테스트**: 기존 예제 저장소로 먼저 테스트해보세요

---

**🎉 이제 당신의 아이디어를 실제 웹사이트로 만들어보세요!**