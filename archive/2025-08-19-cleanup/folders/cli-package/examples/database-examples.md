# 🗄️ 데이터베이스 배포 예제

## 1. PostgreSQL 사용

```bash
# Next.js 앱 + PostgreSQL
codeb deploy blog-app https://github.com/username/nextjs-blog \
  --db postgresql \
  --env NEXTAUTH_SECRET=your-secret-here \
  --env NEXTAUTH_URL=https://blog-app.one-q.xyz

# 결과
✅ 데이터베이스: postgresql
✅ 생성된 데이터베이스:
  - postgresql: main
ℹ 환경변수가 자동으로 설정됩니다:
  - DATABASE_URL=postgres://user:pass@host:5432/dbname
```

## 2. 다중 데이터베이스

```bash
# Express API + PostgreSQL + Redis + MongoDB
codeb deploy enterprise-api https://github.com/username/enterprise-api \
  --db postgresql redis mongodb \
  --env NODE_ENV=production \
  --env JWT_SECRET=super-secure-secret

# 결과
✅ 데이터베이스: postgresql, redis, mongodb
✅ 생성된 데이터베이스:
  - postgresql: main
  - redis: main  
  - mongodb: main
ℹ 환경변수가 자동으로 설정됩니다:
  - DATABASE_URL=postgres://...
  - REDIS_URL=redis://...
  - MONGODB_URL=mongodb://...
```

## 3. MySQL 사용

```bash
# Laravel 앱 + MySQL
codeb deploy laravel-shop https://github.com/username/laravel-shop \
  --db mysql \
  --env APP_ENV=production \
  --env APP_KEY=base64:your-app-key

# 결과
✅ 데이터베이스: mysql
✅ 생성된 데이터베이스:
  - mysql: main
ℹ 환경변수:
  - DB_CONNECTION=mysql
  - DB_HOST=mysql-host
  - DB_DATABASE=main
  - DB_USERNAME=user
  - DB_PASSWORD=password
```

## 4. Redis 캐시 서버

```bash
# Node.js API + Redis (캐시용)
codeb deploy fast-api https://github.com/username/fastify-api \
  --db redis \
  --env NODE_ENV=production \
  --env CACHE_TTL=3600

# 결과
✅ 데이터베이스: redis
✅ 생성된 데이터베이스:
  - redis: main
ℹ 환경변수:
  - REDIS_URL=redis://redis-host:6379
```

## 환경변수 자동 설정

배포 시 다음 환경변수들이 자동으로 설정됩니다:

### PostgreSQL
- `DATABASE_URL`: postgres://user:pass@host:5432/dbname
- `POSTGRES_HOST`: PostgreSQL 호스트
- `POSTGRES_PORT`: 5432
- `POSTGRES_DB`: 데이터베이스명
- `POSTGRES_USER`: 사용자명
- `POSTGRES_PASSWORD`: 비밀번호

### MySQL
- `DATABASE_URL`: mysql://user:pass@host:3306/dbname
- `DB_HOST`: MySQL 호스트
- `DB_PORT`: 3306
- `DB_DATABASE`: 데이터베이스명
- `DB_USERNAME`: 사용자명
- `DB_PASSWORD`: 비밀번호

### Redis
- `REDIS_URL`: redis://host:6379
- `REDIS_HOST`: Redis 호스트
- `REDIS_PORT`: 6379

### MongoDB
- `MONGODB_URL`: mongodb://user:pass@host:27017/dbname
- `MONGO_HOST`: MongoDB 호스트
- `MONGO_PORT`: 27017
- `MONGO_DATABASE`: 데이터베이스명