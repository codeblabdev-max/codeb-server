# 🚀 CodeB CLI

**한 줄 명령으로 Git 저장소를 실제 웹사이트로 배포하는 CLI 도구**

Coolify PaaS + PowerDNS를 사용하여 자동 도메인 할당, SSL 인증서 발급, 데이터베이스 연동까지 모든 것을 자동화합니다.

## ⚡ 빠른 시작

### 설치
```bash
npm install -g codeb-cli
```

### 기본 사용법
```bash
# Git 저장소 배포
codeb deploy my-app https://github.com/username/repository

# 현재 폴더 배포 (Git 저장소여야 함)
codeb init my-project

# 배포 상태 확인
codeb status

# 서버 상태 확인
codeb health
```

## 📖 상세 사용법

### 1. 프로젝트 배포

#### 기본 배포
```bash
codeb deploy my-app https://github.com/username/my-app
```
**결과**: https://my-app.one-q.xyz

#### 고급 옵션
```bash
codeb deploy my-fullstack-app https://github.com/username/app \
  --branch develop \
  --port 8080 \
  --type dockerfile \
  --db postgresql mysql redis \
  --env NODE_ENV=production API_KEY=secret123
```

### 2. 현재 디렉토리 배포
```bash
# 현재 폴더가 Git 저장소인 경우
cd /path/to/your/project
codeb init my-project-name
```

### 3. 프로젝트 관리

#### 상태 확인
```bash
codeb status                    # 모든 프로젝트
codeb status my-app            # 특정 프로젝트
codeb list                     # 별칭
```

#### 로그 확인
```bash
codeb logs my-app              # 기본 로그
codeb logs my-app --follow     # 실시간 로그
codeb logs my-app -n 200       # 200줄 표시
```

#### 프로젝트 삭제
```bash
codeb delete my-app            # 확인 후 삭제
codeb delete my-app --force    # 강제 삭제
```

### 4. 설정 관리

#### 설정 확인
```bash
codeb config --show
```

#### 서버 URL 변경
```bash
codeb config --server http://your-server:3007
```

#### 설정 초기화
```bash
codeb config --reset
```

## 🔧 지원 기능

### 프레임워크 자동 감지
- **Node.js**: React, Vue.js, Next.js, Express
- **Python**: Django, Flask, FastAPI
- **PHP**: Laravel, WordPress
- **Go**: Gin, Echo
- **기타**: Dockerfile 사용

### 데이터베이스 지원
- **PostgreSQL**: `--db postgresql`
- **MySQL**: `--db mysql` 
- **Redis**: `--db redis`
- **MongoDB**: `--db mongodb`
- **다중 DB**: `--db postgresql redis`

### 빌드 옵션
- **Nixpacks** (기본): 자동 감지 및 빌드
- **Dockerfile**: `--type dockerfile`

### 환경변수
```bash
codeb deploy my-app https://github.com/user/repo \
  --env NODE_ENV=production \
  --env DATABASE_URL=postgres://... \
  --env API_SECRET=your-secret
```

## 📊 명령어 참조

| 명령어 | 설명 | 예시 |
|--------|------|------|
| `deploy` | Git 저장소 배포 | `codeb deploy app https://github.com/user/repo` |
| `init` | 현재 폴더 배포 | `codeb init my-app` |
| `status` | 배포 상태 확인 | `codeb status` |
| `logs` | 로그 확인 | `codeb logs my-app` |
| `delete` | 프로젝트 삭제 | `codeb delete my-app` |
| `config` | 설정 관리 | `codeb config --show` |
| `health` | 서버 상태 | `codeb health` |
| `list` | 프로젝트 목록 | `codeb list` |

## 🌟 실제 사용 예시

### 1. React 앱 배포
```bash
codeb deploy react-todo https://github.com/username/react-todo-app
# → https://react-todo.one-q.xyz
```

### 2. Next.js + PostgreSQL
```bash
codeb deploy blog-app https://github.com/username/nextjs-blog \
  --db postgresql \
  --env NEXTAUTH_SECRET=your-secret
# → https://blog-app.one-q.xyz + PostgreSQL DB
```

### 3. 현재 프로젝트 배포
```bash
cd /path/to/my-awesome-project
git remote -v  # 원격 저장소 확인
codeb init awesome-project
# → https://awesome-project.one-q.xyz
```

### 4. 개발 브랜치 배포
```bash
codeb deploy staging-app https://github.com/username/app \
  --branch develop \
  --env NODE_ENV=staging
# → https://staging-app.one-q.xyz
```

## 🔍 문제 해결

### 일반적인 문제

#### 1. 서버 연결 실패
```bash
codeb health  # 서버 상태 확인
codeb config --server http://your-correct-server:3007
```

#### 2. Git 저장소 인식 실패
```bash
git remote -v  # 원격 저장소 확인
git remote add origin https://github.com/username/repo
```

#### 3. 프로젝트 이름 규칙
- 영문 소문자, 숫자, 하이픈(-)만 사용
- 63자 이하
- 예: `my-app`, `blog2024`, `api-server`

#### 4. 배포 상태 확인
```bash
codeb status my-app  # 특정 프로젝트 상태
codeb logs my-app    # 배포 로그 확인
```

### 고급 문제 해결
자세한 문제 해결 가이드는 [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)를 참조하세요.

## 🎯 배포 프로세스

1. **Git 저장소 분석** → 프레임워크 자동 감지
2. **Coolify 프로젝트 생성** → Docker 컨테이너 배포
3. **PowerDNS 레코드 생성** → `*.one-q.xyz` 도메인 할당
4. **SSL 인증서 발급** → Let's Encrypt 자동 설정
5. **데이터베이스 생성** → 필요시 자동 연결
6. **환경변수 설정** → 앱 설정 자동 주입

**평균 배포 시간**: 1-2분 ⚡

## 🔐 보안

- 모든 통신은 HTTPS 사용
- API 키는 로컬 설정 파일에 암호화 저장
- 컨테이너 격리로 앱 간 분리
- 자동 SSL 인증서 발급 및 갱신

## 🤝 기여

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📝 라이선스

MIT License - 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 🆘 지원

- **GitHub Issues**: [https://github.com/your-username/codeb-cli/issues](https://github.com/your-username/codeb-cli/issues)
- **Documentation**: [전체 문서](./COMPLETE_PROJECT_DOCUMENTATION.md)
- **Discord**: [커뮤니티 채널](#)

---

**💡 한 줄로 아이디어를 현실로 만드세요!**

```bash
codeb deploy my-genius-idea https://github.com/me/genius-idea
```