# 🚀 LXD Complete Project Management System
## ENV 관리 + 서버 배포 + SQL 백업 + 스토리지 관리 통합 설계

---

## 📋 확장된 시스템 개요

### 핵심 기능 확장
```yaml
Environment Management: 다중 환경 변수 관리 (dev/staging/prod)
Automated Deployment: 완전 자동화된 서버 배포
SQL Backup System: 자동/수동 데이터베이스 백업 및 복원
Storage Management: 별도 스토리지 볼륨 관리 (Block Storage/Object Storage)
File Synchronization: 프로젝트 파일 자동 동기화
```

---

## 🔐 ENV 환경 변수 관리

### 1. 환경별 변수 관리 구조
```bash
# 환경 변수 설정 명령어
lxdctl env set <project> <key>=<value> --env=production
lxdctl env list <project> --env=staging
lxdctl env import <project> --file=.env.production
lxdctl env export <project> --env=production > backup.env
lxdctl env sync <project> --from=staging --to=production
```

### 2. ENV 파일 구조
```
/storage/projects/{project_name}/
├── envs/
│   ├── .env.development      # 개발 환경
│   ├── .env.staging          # 스테이징 환경
│   ├── .env.production       # 프로덕션 환경
│   ├── .env.local           # 로컬 개발용 (Git 제외)
│   └── .env.secrets         # 암호화된 시크릿
├── backups/
│   └── envs/
│       ├── .env.production.20250818.bak
│       └── .env.staging.20250818.bak
```

### 3. ENV 암호화 및 보안
```javascript
// env-manager.js
class EnvManager {
  constructor() {
    this.encryptionKey = process.env.MASTER_KEY;
  }
  
  // 환경 변수 암호화 저장
  async setSecure(project, key, value, environment = 'production') {
    const encrypted = await this.encrypt(value);
    const path = `/storage/projects/${project}/envs/.env.${environment}`;
    
    // 암호화된 값 저장
    await this.writeEnv(path, key, encrypted, true);
    
    // 감사 로그
    await this.auditLog({
      action: 'env_set',
      project,
      key,
      environment,
      user: getCurrentUser(),
      timestamp: new Date()
    });
  }
  
  // 환경 변수 일괄 동기화
  async syncEnvironments(project, from, to) {
    const sourceEnv = await this.loadEnv(project, from);
    const targetEnv = await this.loadEnv(project, to);
    
    // 차이점 분석
    const diff = this.compareEnvs(sourceEnv, targetEnv);
    
    // 승인 요청
    if (diff.hasChanges) {
      const approved = await this.requestApproval(diff);
      if (!approved) return;
    }
    
    // 동기화 실행
    await this.applyEnvChanges(project, to, diff);
  }
  
  // 환경 변수 버전 관리
  async versionControl(project, environment) {
    const currentEnv = await this.loadEnv(project, environment);
    const version = await this.getNextVersion(project, environment);
    
    // Git 저장소에 커밋 (암호화된 상태로)
    await git.add(`.env.${environment}.encrypted`);
    await git.commit(`ENV: Update ${environment} to v${version}`);
    await git.tag(`env-${environment}-v${version}`);
  }
}
```

### 4. ENV 템플릿 시스템
```yaml
# env-templates/nodejs.yml
template: nodejs
version: 1.0
environments:
  development:
    NODE_ENV: development
    PORT: 3000
    LOG_LEVEL: debug
    DB_HOST: localhost
    REDIS_HOST: localhost
    
  staging:
    NODE_ENV: staging
    PORT: 3000
    LOG_LEVEL: info
    DB_HOST: "{{DB_STAGING_HOST}}"
    REDIS_HOST: "{{REDIS_STAGING_HOST}}"
    
  production:
    NODE_ENV: production
    PORT: 3000
    LOG_LEVEL: error
    DB_HOST: "{{DB_PROD_HOST}}"
    REDIS_HOST: "{{REDIS_PROD_HOST}}"
    ENABLE_MONITORING: true
    ENABLE_APM: true
```

---

## 🚀 서버 배포 자동화

### 1. 배포 전략 및 명령어
```bash
# 다양한 배포 전략
lxdctl deploy <project> --strategy=blue-green --env=production
lxdctl deploy <project> --strategy=canary --percentage=10
lxdctl deploy <project> --strategy=rolling --batch-size=2
lxdctl deploy <project> --strategy=instant --force

# 배포 관리
lxdctl deploy status <project>
lxdctl deploy rollback <project> --version=v1.2.3
lxdctl deploy history <project> --limit=10
lxdctl deploy approve <project> --deployment-id=xxx
```

### 2. 배포 프로세스 상세
```javascript
// deployment-manager.js
class DeploymentManager {
  async deploy(project, options = {}) {
    const deployment = {
      id: uuid(),
      project,
      version: await this.getNextVersion(project),
      strategy: options.strategy || 'instant',
      environment: options.env || 'production',
      startedAt: new Date()
    };
    
    try {
      // 1. Pre-deployment 체크
      await this.preDeploymentChecks(project);
      
      // 2. 환경 변수 로드
      await this.loadEnvironmentVariables(project, deployment.environment);
      
      // 3. 데이터베이스 백업 (자동)
      await this.backupDatabase(project);
      
      // 4. 파일 동기화
      await this.syncFiles(project);
      
      // 5. 배포 전략별 실행
      switch(deployment.strategy) {
        case 'blue-green':
          await this.blueGreenDeploy(project, deployment);
          break;
        case 'canary':
          await this.canaryDeploy(project, deployment, options.percentage);
          break;
        case 'rolling':
          await this.rollingDeploy(project, deployment, options.batchSize);
          break;
        default:
          await this.instantDeploy(project, deployment);
      }
      
      // 6. Post-deployment
      await this.postDeploymentTasks(project, deployment);
      
      // 7. 헬스체크
      await this.healthCheck(project);
      
      deployment.status = 'success';
      deployment.completedAt = new Date();
      
    } catch (error) {
      deployment.status = 'failed';
      deployment.error = error.message;
      
      // 자동 롤백
      if (options.autoRollback) {
        await this.rollback(project, deployment.previousVersion);
      }
    }
    
    // 배포 기록 저장
    await this.saveDeploymentHistory(deployment);
    
    // 알림 발송
    await this.notifyDeployment(deployment);
    
    return deployment;
  }
  
  // Blue-Green 배포
  async blueGreenDeploy(project, deployment) {
    // 새 환경 생성 (Green)
    const greenContainer = await this.createContainer(`${project}-green`);
    
    // Green 환경에 배포
    await this.deployToContainer(greenContainer, deployment);
    
    // Green 환경 테스트
    await this.runSmokeTests(greenContainer);
    
    // 트래픽 전환
    await this.switchTraffic(project, greenContainer);
    
    // Blue 환경 정리 (일정 시간 후)
    setTimeout(() => {
      this.cleanupOldContainer(`${project}-blue`);
    }, 3600000); // 1시간 후
  }
}
```

### 3. 배포 파이프라인 설정
```yaml
# .lxdctl-deploy.yml
deployment:
  triggers:
    - type: git_push
      branch: main
      auto_deploy: true
      environment: production
      
    - type: git_tag
      pattern: "v*"
      auto_deploy: false  # 수동 승인 필요
      environment: production
      
    - type: schedule
      cron: "0 2 * * *"  # 매일 새벽 2시
      environment: staging
      
  pre_deployment:
    - name: "Run Tests"
      command: "npm test"
      timeout: 300
      
    - name: "Database Migration"
      command: "npm run migrate"
      
    - name: "Backup Database"
      command: "lxdctl backup create --type=sql"
      
  post_deployment:
    - name: "Clear Cache"
      command: "redis-cli FLUSHALL"
      
    - name: "Warm Up"
      command: "curl http://localhost/health"
      
    - name: "Notify Team"
      command: "slack-notify 'Deployment completed'"
      
  rollback:
    triggers:
      - error_rate: 5  # 5% 에러율 초과 시
      - response_time: 2000  # 2초 이상 응답 시간
      - health_check_fail: 3  # 3회 연속 헬스체크 실패
```

---

## 💾 SQL 백업 시스템

### 1. 백업 명령어
```bash
# 백업 생성
lxdctl backup create <project> --type=sql --compression=gzip
lxdctl backup create <project> --type=full --include-files
lxdctl backup schedule <project> --cron="0 */6 * * *"  # 6시간마다

# 백업 관리
lxdctl backup list <project>
lxdctl backup restore <project> --backup-id=xxx --target-env=staging
lxdctl backup delete <project> --older-than=30d
lxdctl backup verify <project> --backup-id=xxx
```

### 2. 백업 구현
```javascript
// backup-manager.js
class BackupManager {
  constructor() {
    this.storageBackend = new S3Storage(); // 또는 로컬 스토리지
  }
  
  // PostgreSQL 백업
  async backupPostgreSQL(project) {
    const config = await this.getDBConfig(project);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${project}-postgres-${timestamp}.sql.gz`;
    
    // pg_dump 실행
    const dumpCommand = `
      PGPASSWORD=${config.password} pg_dump \
        -h ${config.host} \
        -U ${config.username} \
        -d ${config.database} \
        --clean --if-exists \
        | gzip > /tmp/${backupName}
    `;
    
    await exec(dumpCommand);
    
    // 스토리지에 업로드
    await this.uploadToStorage(
      `/tmp/${backupName}`,
      `backups/${project}/postgres/${backupName}`
    );
    
    // 백업 메타데이터 저장
    await this.saveBackupMetadata({
      project,
      type: 'postgresql',
      filename: backupName,
      size: await this.getFileSize(`/tmp/${backupName}`),
      timestamp,
      retention: 30, // 30일 보관
      encrypted: true
    });
    
    // 로컬 임시 파일 삭제
    await fs.unlink(`/tmp/${backupName}`);
    
    return backupName;
  }
  
  // Redis 백업
  async backupRedis(project) {
    const config = await this.getRedisConfig(project);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `${project}-redis-${timestamp}.rdb`;
    
    // BGSAVE 실행
    await redis.bgsave();
    
    // RDB 파일 복사
    await fs.copyFile(
      '/var/lib/redis/dump.rdb',
      `/storage/backups/${project}/redis/${backupName}`
    );
    
    return backupName;
  }
  
  // 자동 백업 스케줄러
  async scheduleBackups(project, schedule) {
    const job = cron.schedule(schedule, async () => {
      console.log(`Starting scheduled backup for ${project}`);
      
      try {
        // 데이터베이스 백업
        const pgBackup = await this.backupPostgreSQL(project);
        const redisBackup = await this.backupRedis(project);
        
        // 파일 백업
        const filesBackup = await this.backupFiles(project);
        
        // 백업 검증
        await this.verifyBackups([pgBackup, redisBackup, filesBackup]);
        
        // 오래된 백업 정리
        await this.cleanupOldBackups(project);
        
        // 알림
        await this.notify({
          project,
          status: 'success',
          backups: [pgBackup, redisBackup, filesBackup]
        });
        
      } catch (error) {
        await this.notify({
          project,
          status: 'failed',
          error: error.message
        });
      }
    });
    
    // 스케줄 저장
    this.schedules.set(project, job);
  }
  
  // 백업 복원
  async restore(project, backupId, targetEnv = 'staging') {
    const backup = await this.getBackupMetadata(backupId);
    
    // 복원 전 현재 상태 백업 (안전장치)
    await this.createSafetyBackup(project, targetEnv);
    
    try {
      // 스토리지에서 다운로드
      const localPath = await this.downloadFromStorage(backup.path);
      
      // 압축 해제
      if (backup.compressed) {
        await this.decompress(localPath);
      }
      
      // PostgreSQL 복원
      if (backup.type === 'postgresql') {
        const config = await this.getDBConfig(project, targetEnv);
        
        const restoreCommand = `
          PGPASSWORD=${config.password} psql \
            -h ${config.host} \
            -U ${config.username} \
            -d ${config.database} \
            < ${localPath}
        `;
        
        await exec(restoreCommand);
      }
      
      // 복원 검증
      await this.verifyRestoration(project, targetEnv);
      
      return {
        success: true,
        restoredAt: new Date(),
        backup: backupId,
        target: targetEnv
      };
      
    } catch (error) {
      // 복원 실패 시 안전장치 백업으로 롤백
      await this.restoreFromSafety(project, targetEnv);
      throw error;
    }
  }
}
```

### 3. 백업 정책 설정
```yaml
# backup-policy.yml
policies:
  production:
    postgresql:
      schedule: "0 */4 * * *"  # 4시간마다
      retention: 30  # 30일 보관
      replicas: 3  # 3개 복사본
      locations:
        - local: /storage/backups
        - s3: s3://backup-bucket/postgres
        - glacier: glacier://long-term  # 장기 보관
    
    redis:
      schedule: "0 * * * *"  # 매시간
      retention: 7  # 7일 보관
      
    files:
      schedule: "0 0 * * *"  # 매일
      retention: 14  # 14일 보관
      exclude:
        - node_modules/
        - .git/
        - tmp/
        
  staging:
    postgresql:
      schedule: "0 0 * * *"  # 매일
      retention: 7
      
  development:
    postgresql:
      schedule: "manual"  # 수동 백업만
      retention: 3
```

---

## 📦 스토리지 파일 관리

### 1. 스토리지 구조
```
/storage/
├── projects/                    # 프로젝트별 스토리지
│   ├── {project_name}/
│   │   ├── uploads/            # 사용자 업로드 파일
│   │   ├── static/             # 정적 파일
│   │   ├── cache/              # 캐시 파일
│   │   ├── logs/               # 로그 파일
│   │   └── temp/               # 임시 파일
├── backups/                     # 백업 스토리지
│   └── {project_name}/
│       ├── sql/                # 데이터베이스 백업
│       ├── files/              # 파일 백업
│       └── configs/            # 설정 백업
├── shared/                      # 공유 스토리지
│   ├── libraries/              # 공통 라이브러리
│   └── assets/                 # 공통 에셋
```

### 2. 파일 관리 명령어
```bash
# 파일 업로드/다운로드
lxdctl storage upload <project> <local-path> <remote-path>
lxdctl storage download <project> <remote-path> <local-path>
lxdctl storage sync <project> --source=local --dest=remote

# 파일 관리
lxdctl storage list <project> <path>
lxdctl storage delete <project> <path>
lxdctl storage move <project> <source> <dest>
lxdctl storage copy <project> <source> <dest>

# 용량 관리
lxdctl storage usage <project>
lxdctl storage quota set <project> --size=10G
lxdctl storage cleanup <project> --older-than=30d
```

### 3. 스토리지 관리 구현
```javascript
// storage-manager.js
class StorageManager {
  constructor() {
    this.backends = {
      local: new LocalStorage(),
      s3: new S3Storage(),
      gcs: new GoogleCloudStorage(),
      azure: new AzureStorage()
    };
  }
  
  // 파일 동기화
  async syncFiles(project, direction = 'both') {
    const projectPath = `/storage/projects/${project}`;
    const containerPath = `/containers/${project}/data`;
    
    if (direction === 'both' || direction === 'to-storage') {
      // 컨테이너 → 스토리지
      await rsync({
        source: containerPath,
        destination: projectPath,
        exclude: ['node_modules', '.git', 'tmp']
      });
    }
    
    if (direction === 'both' || direction === 'from-storage') {
      // 스토리지 → 컨테이너
      await rsync({
        source: projectPath,
        destination: containerPath,
        exclude: ['backups', 'logs']
      });
    }
  }
  
  // 스토리지 모니터링
  async monitorUsage(project) {
    const usage = await this.calculateUsage(project);
    const quota = await this.getQuota(project);
    
    // 용량 경고
    if (usage.percent > 80) {
      await this.alert({
        level: 'warning',
        message: `Storage usage for ${project} is at ${usage.percent}%`
      });
    }
    
    // 자동 정리
    if (usage.percent > 90) {
      await this.autoCleanup(project);
    }
    
    return {
      used: usage.bytes,
      quota: quota.bytes,
      percent: usage.percent,
      breakdown: {
        uploads: usage.uploads,
        cache: usage.cache,
        logs: usage.logs,
        backups: usage.backups
      }
    };
  }
  
  // CDN 연동
  async setupCDN(project) {
    const cdnConfig = {
      origin: `/storage/projects/${project}/static`,
      distribution: `${project}.cdn.example.com`,
      cache: {
        images: '1y',
        css: '1M',
        js: '1M',
        html: '1d'
      }
    };
    
    // CloudFlare/CloudFront 설정
    await this.cdnProvider.createDistribution(cdnConfig);
    
    // 파일 업로드
    await this.syncToCDN(project);
  }
  
  // 파일 버전 관리
  async versionFile(project, filepath) {
    const version = await this.getNextVersion(filepath);
    const timestamp = Date.now();
    
    // 이전 버전 백업
    await fs.copyFile(
      filepath,
      `${filepath}.${version}.${timestamp}`
    );
    
    // 버전 메타데이터
    await this.saveVersionMetadata({
      file: filepath,
      version,
      timestamp,
      size: await this.getFileSize(filepath),
      checksum: await this.calculateChecksum(filepath)
    });
  }
}
```

### 4. 객체 스토리지 통합
```javascript
// S3 통합 예시
class S3StorageBackend {
  async upload(localPath, remotePath) {
    const fileStream = fs.createReadStream(localPath);
    const uploadParams = {
      Bucket: this.bucket,
      Key: remotePath,
      Body: fileStream,
      ServerSideEncryption: 'AES256',
      StorageClass: 'INTELLIGENT_TIERING'  // 비용 최적화
    };
    
    // 멀티파트 업로드 (대용량 파일)
    if (await this.getFileSize(localPath) > 100 * 1024 * 1024) {
      return await this.multipartUpload(uploadParams);
    }
    
    return await this.s3.upload(uploadParams).promise();
  }
  
  async download(remotePath, localPath) {
    const downloadParams = {
      Bucket: this.bucket,
      Key: remotePath
    };
    
    const data = await this.s3.getObject(downloadParams).promise();
    await fs.writeFile(localPath, data.Body);
  }
  
  // Lifecycle 정책
  async setLifecyclePolicy(project) {
    const policy = {
      Rules: [
        {
          Id: 'MoveOldBackupsToGlacier',
          Status: 'Enabled',
          Transitions: [
            {
              Days: 30,
              StorageClass: 'GLACIER'
            }
          ],
          Expiration: {
            Days: 365  // 1년 후 삭제
          }
        }
      ]
    };
    
    await this.s3.putBucketLifecycleConfiguration({
      Bucket: this.bucket,
      LifecycleConfiguration: policy
    }).promise();
  }
}
```

---

## 🔄 통합 워크플로우

### 전체 자동화 시나리오
```bash
# 1. 프로젝트 생성 (모든 것이 자동 설정)
lxdctl project create awesome-app \
  --git https://github.com/user/awesome-app \
  --db postgres \
  --cache redis \
  --storage 50G \
  --backup-schedule "0 */6 * * *"

# 2. 환경 변수 설정
lxdctl env import awesome-app --file .env.production --env production
lxdctl env set awesome-app API_KEY=xxx --env production --encrypt

# 3. 첫 배포
lxdctl deploy awesome-app --env production --strategy blue-green

# 자동으로 실행되는 작업:
# - Git clone
# - LXD 컨테이너 생성
# - PostgreSQL + Redis 설정
# - 환경 변수 주입
# - DNS 레코드 생성
# - SSL 인증서 발급
# - 빌드 & 테스트
# - 배포
# - 백업 스케줄 설정
# - 모니터링 활성화
```

---

## 📊 모니터링 대시보드

```yaml
monitoring:
  metrics:
    - deployment_frequency
    - backup_success_rate
    - storage_usage
    - database_size
    - response_time
    - error_rate
    
  alerts:
    - storage_full: usage > 90%
    - backup_failed: 2 consecutive failures
    - deployment_failed: any failure
    - database_slow: query_time > 1s
    - high_error_rate: errors > 5%
```

---

**작성일**: 2025-08-18  
**버전**: 2.0.0  
**상태**: 🔵 확장 설계 완료