# 🚀 Podman Quick Start Guide
## 서버 141.164.60.51 즉시 배포 가이드

---

## 📋 서버 설치 스크립트

### 1. Podman + Caddy 자동 설치
```bash
#!/bin/bash
# install-podman-caddy.sh

# 색상 코드
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Podman + Caddy 설치 시작 ===${NC}"

# 1. 시스템 업데이트
sudo apt update && sudo apt upgrade -y

# 2. Podman 설치
echo -e "${GREEN}Podman 설치 중...${NC}"
sudo apt install -y podman podman-compose slirp4netns fuse-overlayfs

# 3. Podman Rootless 설정
echo -e "${GREEN}Podman Rootless 설정 중...${NC}"
sudo usermod --add-subuids 100000-165535 $USER
sudo usermod --add-subgids 100000-165535 $USER
echo "user.max_user_namespaces=28633" | sudo tee /etc/sysctl.d/userns.conf
sudo sysctl -p /etc/sysctl.d/userns.conf

# 4. Caddy 설치
echo -e "${GREEN}Caddy 설치 중...${NC}"
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# 5. 디렉토리 구조 생성
echo -e "${GREEN}디렉토리 구조 생성 중...${NC}"
mkdir -p ~/podctl/{scripts,configs,templates,logs}
mkdir -p /mnt/blockstorage/{projects,postgres,redis,backups}

# 6. 기본 Caddyfile 설정
sudo tee /etc/caddy/Caddyfile > /dev/null <<EOF
{
    email admin@example.com
}

# 기본 설정 - 프로젝트별로 자동 추가됨
import /etc/caddy/sites/*.caddy
EOF

sudo mkdir -p /etc/caddy/sites
sudo systemctl restart caddy

echo -e "${GREEN}✅ 설치 완료!${NC}"
echo "재로그인 후 podman 명령어를 사용할 수 있습니다."
```

---

## 🔧 PodCTL CLI 도구 설치

### CLI 도구 다운로드 및 설치
```bash
#!/bin/bash
# install-podctl.sh

# CLI 도구 다운로드
curl -fsSL https://raw.githubusercontent.com/your-repo/podctl/main/podctl.js -o ~/podctl/podctl.js
chmod +x ~/podctl/podctl.js

# Node.js 설치 (CLI 실행용)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 필요한 패키지 설치
cd ~/podctl
npm init -y
npm install commander inquirer chalk axios js-yaml shelljs

# 전역 명령어로 등록
sudo ln -sf ~/podctl/podctl.js /usr/local/bin/podctl

# 설정 파일 생성
cat > ~/podctl/config.json <<EOF
{
  "server": "141.164.60.51",
  "storage": "/mnt/blockstorage",
  "caddy_sites": "/etc/caddy/sites",
  "default_db_port": 5432,
  "default_redis_port": 6379,
  "default_app_port": 3000
}
EOF

echo "✅ PodCTL 설치 완료!"
echo "사용: podctl --help"
```

---

## 🚀 첫 번째 프로젝트 배포

### 1. 프로젝트 생성 및 배포 (한 줄 명령)
```bash
# Node.js 프로젝트 예시
podctl create myapp \
  --git https://github.com/user/myapp \
  --domain myapp.com \
  --ssl \
  --auto-deploy
```

### 2. 수동 프로젝트 설정
```bash
# 1. Pod 생성
cat > myapp-pod.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  labels:
    app: myapp
spec:
  containers:
    - name: app
      image: node:18-alpine
      command: ["npm", "start"]
      workingDir: /app
      ports:
        - containerPort: 3000
      env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          value: postgresql://postgres:mypassword@localhost:5432/myapp
        - name: REDIS_URL
          value: redis://localhost:6379
      volumeMounts:
        - name: app-code
          mountPath: /app
    
    - name: postgres
      image: postgres:15-alpine
      env:
        - name: POSTGRES_DB
          value: myapp
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          value: mypassword
      volumeMounts:
        - name: postgres-data
          mountPath: /var/lib/postgresql/data
    
    - name: redis
      image: redis:7-alpine
      command: ["redis-server", "--appendonly", "yes"]
      volumeMounts:
        - name: redis-data
          mountPath: /data
  
  volumes:
    - name: app-code
      hostPath:
        path: /mnt/blockstorage/projects/myapp/code
    - name: postgres-data
      hostPath:
        path: /mnt/blockstorage/postgres/myapp
    - name: redis-data
      hostPath:
        path: /mnt/blockstorage/redis/myapp
EOF

# 2. Pod 실행
podman play kube myapp-pod.yaml

# 3. Caddy 설정 추가
sudo tee /etc/caddy/sites/myapp.caddy > /dev/null <<EOF
myapp.com {
    reverse_proxy localhost:3001
    encode gzip
    log {
        output file /var/log/caddy/myapp.log
    }
}
EOF

# 4. Caddy 재시작
sudo systemctl reload caddy
```

---

## 📦 실제 프로젝트 템플릿

### Node.js Express 앱
```javascript
// package.json
{
  "name": "myapp",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
  "dependencies": {
    "express": "^4.18.0",
    "pg": "^8.11.0",
    "redis": "^4.6.0",
    "dotenv": "^16.0.0"
  }
}

// server.js
const express = require('express');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();

// PostgreSQL 연결
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Redis 연결
const redisClient = redis.createClient({
  url: process.env.REDIS_URL
});

redisClient.connect();

app.get('/', async (req, res) => {
  // Redis 캐시 확인
  const cached = await redisClient.get('homepage');
  if (cached) {
    return res.send(cached);
  }

  // DB 쿼리
  const result = await pool.query('SELECT NOW()');
  const response = `Hello from Podman! Server time: ${result.rows[0].now}`;
  
  // Redis 캐시 저장
  await redisClient.set('homepage', response, { EX: 60 });
  
  res.send(response);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Dockerfile (컨테이너 빌드용)
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

---

## 🔄 CI/CD 설정

### GitHub Actions 워크플로우
```yaml
# .github/workflows/deploy.yml
name: Deploy to Podman Server

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to Server
        uses: appleboy/ssh-action@v0.1.5
        with:
          host: 141.164.60.51
          username: root
          key: ${{ secrets.SSH_KEY }}
          script: |
            cd /mnt/blockstorage/projects/${{ github.event.repository.name }}/code
            git pull origin main
            
            # 컨테이너 재시작
            podman pod restart ${{ github.event.repository.name }}
            
            # 헬스체크
            sleep 5
            curl -f http://localhost:3001/health || exit 1
```

---

## 📊 모니터링 설정

### 간단한 모니터링 스크립트
```bash
#!/bin/bash
# monitor.sh

PROJECT=$1

echo "=== Project: $PROJECT ==="

# Pod 상태
echo "Pod Status:"
podman pod ps --filter name=$PROJECT

# 컨테이너 상태
echo -e "\nContainer Status:"
podman ps --filter pod=$PROJECT

# 리소스 사용량
echo -e "\nResource Usage:"
podman stats --no-stream --filter pod=$PROJECT

# 로그 (최근 10줄)
echo -e "\nRecent Logs:"
podman logs --tail 10 ${PROJECT}_app_1

# PostgreSQL 연결 확인
echo -e "\nDatabase Status:"
podman exec ${PROJECT}_postgres_1 pg_isready

# Redis 연결 확인
echo -e "\nRedis Status:"
podman exec ${PROJECT}_redis_1 redis-cli ping
```

---

## 🔐 보안 강화

### 방화벽 설정
```bash
# UFW 설정
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Fail2ban 설치
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 자동 백업 크론탭
```bash
# 매일 새벽 2시 백업
crontab -e

0 2 * * * /home/user/podctl/scripts/backup-all.sh
```

---

## 🎯 빠른 명령어 모음

```bash
# 프로젝트 관리
podctl create <project>        # 새 프로젝트 생성
podctl list                    # 프로젝트 목록
podctl status <project>        # 상태 확인
podctl logs <project>          # 로그 보기
podctl delete <project>        # 프로젝트 삭제

# 배포 관리
podctl deploy <project>        # 배포
podctl rollback <project>      # 롤백
podctl restart <project>       # 재시작

# 데이터베이스
podctl db backup <project>     # DB 백업
podctl db restore <project>    # DB 복원
podctl db shell <project>      # DB 접속

# 환경 변수
podctl env list <project>      # 환경변수 목록
podctl env set <project> KEY=value  # 환경변수 설정

# Pod 관리 (직접)
podman pod ls                  # Pod 목록
podman pod start <pod>         # Pod 시작
podman pod stop <pod>          # Pod 중지
podman pod rm <pod>            # Pod 삭제

# 컨테이너 접속
podman exec -it <project>_app_1 /bin/sh
podman exec -it <project>_postgres_1 psql -U postgres
podman exec -it <project>_redis_1 redis-cli
```

---

## 🚨 트러블슈팅

### 일반적인 문제 해결

**1. Pod가 시작되지 않음**
```bash
# 로그 확인
podman pod logs <project>

# 이벤트 확인
podman events --filter pod=<project>

# 강제 재생성
podman pod rm -f <project>
podman play kube <project>-pod.yaml
```

**2. 포트 충돌**
```bash
# 사용 중인 포트 확인
sudo netstat -tlnp | grep :3000

# 포트 변경
podctl config set <project> port 3001
```

**3. 디스크 공간 부족**
```bash
# 불필요한 이미지 정리
podman image prune -a

# 오래된 컨테이너 정리
podman container prune

# 볼륨 정리
podman volume prune
```

---

## 📚 추가 리소스

- [Podman 공식 문서](https://podman.io/docs)
- [Caddy 공식 문서](https://caddyserver.com/docs)
- [PostgreSQL + Podman](https://www.postgresql.org/docs/current/install-procedure.html)
- [Redis + Podman](https://redis.io/docs/getting-started/)

---

**작성일**: 2025-08-18  
**버전**: 1.0.0  
**상태**: 🟢 즉시 사용 가능