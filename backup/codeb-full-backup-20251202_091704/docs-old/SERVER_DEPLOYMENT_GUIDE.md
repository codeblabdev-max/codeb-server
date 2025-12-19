# CodeB CLI v3.5 - 서버 배포 가이드

## 개요

CodeB CLI v3.5의 서버 배포 기능을 사용하면 로컬 Podman 구성을 원격 서버에 쉽게 배포할 수 있습니다.

## 사전 요구사항

### 로컬 환경
- CodeB CLI v3.5 설치 완료
- 프로젝트가 로컬 모드로 초기화됨
- Podman/Docker 컨테이너가 정상 작동 중

### 원격 서버
- SSH 접속 가능
- Podman 또는 Docker 설치됨
- 필요한 포트 열려있음 (PostgreSQL: 5432, Redis: 6379)

## 서버 배포 명령어

### 1. 배포 준비
```bash
# 배포 패키지 준비
codeb server prepare <서버주소>

# 예시
codeb server prepare server.example.com
codeb server prepare user@192.168.1.100
```

이 명령은:
- `deploy/` 디렉토리 생성
- Docker Compose 파일 복사
- 환경 설정 파일 생성
- 원격 설정 스크립트 준비

### 2. 서버로 배포
```bash
# 파일 업로드
codeb server deploy <서버주소> [배포경로]

# 예시
codeb server deploy server.example.com
codeb server deploy user@192.168.1.100 /home/user/apps
```

기본 배포 경로: `~/codeb-projects/<프로젝트명>`

### 3. 원격 설정 실행
```bash
# 서버에서 설정 스크립트 실행
codeb server setup <서버주소>

# 예시
codeb server setup server.example.com
```

이 명령은:
- 필요한 디렉토리 생성
- 환경 변수 설정
- 컨테이너 시작
- 데이터베이스 초기화

### 4. 서버 관리 명령어

#### 상태 확인
```bash
codeb server status <서버주소>
```

#### 컨테이너 시작
```bash
codeb server start <서버주소>
```

#### 컨테이너 중지
```bash
codeb server stop <서버주소>
```

#### 백업 생성
```bash
codeb server backup <서버주소>
```

#### 배포 정보 확인
```bash
codeb server info
```

## 전체 배포 워크플로우

### 신규 프로젝트 배포
```bash
# 1. 로컬에서 프로젝트 생성
codeb create myapp nextjs local

# 2. 로컬 개발 환경 시작
cd myapp
codeb local start

# 3. 개발 작업...

# 4. 서버 배포 준비
codeb server prepare prod.example.com

# 5. 서버로 파일 전송
codeb server deploy prod.example.com

# 6. 서버 설정 실행
codeb server setup prod.example.com

# 7. 상태 확인
codeb server status prod.example.com
```

### 기존 프로젝트 업데이트
```bash
# 1. 코드 변경사항 적용
git push origin main

# 2. 서버에서 직접 업데이트
ssh user@server.example.com
cd ~/codeb-projects/myapp
git pull
npm run build
pm2 restart myapp
```

## 환경 설정

### SSH 설정
`~/.ssh/config` 파일에 서버 정보를 추가하면 편리합니다:

```
Host myserver
    HostName server.example.com
    User deploy
    Port 22
    IdentityFile ~/.ssh/id_rsa
```

사용:
```bash
codeb server deploy myserver
```

### 환경 변수
서버별 환경 변수는 `.env.production`에 설정:

```env
# 데이터베이스
DATABASE_URL=postgresql://user:pass@localhost:5432/myapp
REDIS_URL=redis://localhost:6379

# 애플리케이션
NODE_ENV=production
PORT=3000

# 외부 서비스
API_KEY=your-api-key
SECRET_KEY=your-secret-key
```

## 문제 해결

### SSH 접속 오류
```bash
# SSH 키 권한 확인
chmod 600 ~/.ssh/id_rsa

# SSH 접속 테스트
ssh -v user@server.example.com
```

### Podman/Docker 권한 오류
```bash
# 서버에서 사용자를 docker 그룹에 추가
sudo usermod -aG docker $USER

# 로그아웃 후 다시 로그인
```

### 포트 충돌
```bash
# 사용 중인 포트 확인
sudo netstat -tulpn | grep :5432
sudo netstat -tulpn | grep :6379

# 필요시 기존 서비스 중지
sudo systemctl stop postgresql
sudo systemctl stop redis
```

### 컨테이너 시작 실패
```bash
# 로그 확인
codeb server status server.example.com

# 서버에서 직접 확인
ssh user@server.example.com
cd ~/codeb-projects/myapp
docker-compose logs
```

## 보안 고려사항

1. **SSH 키 인증 사용**
   - 비밀번호 인증보다 SSH 키 사용 권장
   - `ssh-keygen -t ed25519`로 키 생성
   - `ssh-copy-id user@server`로 키 복사

2. **방화벽 설정**
   - 필요한 포트만 열기
   - PostgreSQL/Redis는 로컬호스트만 허용

3. **환경 변수 보호**
   - `.env.production`을 git에 커밋하지 않기
   - 민감한 정보는 서버에서 직접 설정

4. **정기 백업**
   ```bash
   # 크론탭 설정 예시
   0 2 * * * /home/user/.codeb/bin/codeb server backup myserver
   ```

## 고급 설정

### 커스텀 Docker Compose
`docker-compose.production.yml` 파일 생성:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    environment:
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_DB: ${DB_NAME}
    ports:
      - "127.0.0.1:5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "127.0.0.1:6379:6379"
    restart: unless-stopped
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

### 다중 서버 배포
여러 서버에 동시 배포:

```bash
#!/bin/bash
# deploy-all.sh

servers=("prod1.example.com" "prod2.example.com" "prod3.example.com")

for server in "${servers[@]}"; do
    echo "Deploying to $server..."
    codeb server prepare $server
    codeb server deploy $server
    codeb server setup $server
    codeb server status $server
done
```

### 블루-그린 배포
```bash
# 새 버전을 다른 포트에 배포
PORT=3001 codeb server deploy blue.example.com

# 테스트 후 트래픽 전환
# nginx 또는 로드 밸런서 설정 변경

# 이전 버전 중지
codeb server stop green.example.com
```

## 지원 및 문의

- GitHub Issues: [프로젝트 저장소]/issues
- 문서: [프로젝트 위키]
- 이메일: support@codeb.io

---

마지막 업데이트: 2025년 1월
버전: CodeB CLI v3.5