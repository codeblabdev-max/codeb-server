const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const { spawn, exec } = require('child_process');

const ProjectGenerator = require('./project-generator');
const LocalDevManager = require('./local-dev-manager');
const ServerDeployer = require('./server-deployer');
const ConfigManager = require('./config-manager');
const DatabaseManager = require('./database-manager');

class CodeB {
  constructor() {
    this.projectGenerator = new ProjectGenerator();
    this.localDevManager = new LocalDevManager();
    this.serverDeployer = new ServerDeployer();
    this.configManager = new ConfigManager();
    this.databaseManager = new DatabaseManager();
  }

  /**
   * 새 프로젝트 생성
   */
  async createProject(projectName, options) {
    const spinner = ora('프로젝트 생성 중...').start();
    
    try {
      // 프로젝트 디렉토리 생성
      const projectPath = path.join(process.cwd(), projectName);
      
      if (await fs.pathExists(projectPath)) {
        spinner.fail('프로젝트 디렉토리가 이미 존재합니다.');
        return;
      }

      await fs.ensureDir(projectPath);
      spinner.text = '프로젝트 구조 생성 중...';
      
      // 환경별 프로젝트 생성
      if (options.mode === 'local') {
        await this.createLocalProject(projectPath, projectName, options);
      } else {
        await this.createServerProject(projectPath, projectName, options);
      }
      
      spinner.succeed(`프로젝트 '${projectName}' 생성 완료!`);
      
      // 다음 단계 안내
      console.log(chalk.cyan.bold('\\n📋 다음 단계:'));
      console.log(chalk.gray(`   cd ${projectName}`));
      
      if (options.mode === 'local') {
        console.log(chalk.gray('   codeb dev          # 로컬 개발 환경 시작'));
        console.log(chalk.gray('   codeb db --migrate # 데이터베이스 마이그레이션'));
      } else {
        console.log(chalk.gray('   codeb deploy       # 서버 배포'));
      }
      
    } catch (error) {
      spinner.fail('프로젝트 생성 실패');
      throw error;
    }
  }

  /**
   * 로컬 개발용 프로젝트 생성
   */
  async createLocalProject(projectPath, projectName, options) {
    // 1. 기본 프로젝트 구조 생성
    await this.projectGenerator.generateProject(projectPath, projectName, {
      ...options,
      mode: 'local'
    });
    
    // 2. Podman 컨테이너 설정 생성
    await this.generatePodmanConfig(projectPath, options);
    
    // 3. 로컬 개발 환경 설정
    await this.generateLocalDevConfig(projectPath, projectName, options);
    
    // 4. 환경 변수 파일 생성
    await this.generateEnvironmentFiles(projectPath, 'local', options);
  }

  /**
   * 서버용 프로젝트 생성
   */
  async createServerProject(projectPath, projectName, options) {
    // 1. 기본 프로젝트 구조 생성
    await this.projectGenerator.generateProject(projectPath, projectName, {
      ...options,
      mode: 'server'
    });
    
    // 2. 서버 배포 설정 생성
    await this.generateServerConfig(projectPath, options);
    
    // 3. 환경 변수 파일 생성
    await this.generateEnvironmentFiles(projectPath, 'server', options);
    
    // 4. Docker/배포 설정 생성
    await this.generateDeploymentConfig(projectPath, options);
  }

  /**
   * Podman 설정 생성 (로컬 개발용)
   */
  async generatePodmanConfig(projectPath, options) {
    const podmanDir = path.join(projectPath, 'podman');
    await fs.ensureDir(podmanDir);
    
    // PostgreSQL 컨테이너 설정
    if (options.db === 'postgresql') {
      const postgresConfig = {
        version: '3.8',
        services: {
          postgres: {
            image: 'postgres:15-alpine',
            container_name: 'codeb-postgres',
            environment: [
              'POSTGRES_DB=codeb_dev',
              'POSTGRES_USER=codeb',
              'POSTGRES_PASSWORD=codeb123',
              'PGDATA=/var/lib/postgresql/data'
            ],
            ports: ['5432:5432'],
            volumes: [
              'postgres_data:/var/lib/postgresql/data',
              './init:/docker-entrypoint-initdb.d'
            ],
            restart: 'unless-stopped',
            networks: ['codeb-network']
          }
        },
        volumes: {
          postgres_data: {}
        },
        networks: {
          'codeb-network': {
            driver: 'bridge'
          }
        }
      };
      
      await fs.writeFile(
        path.join(podmanDir, 'docker-compose.postgres.yml'),
        require('yaml').stringify(postgresConfig)
      );
    }
    
    // Redis 컨테이너 설정
    if (options.cache === 'redis') {
      const redisConfig = {
        version: '3.8',
        services: {
          redis: {
            image: 'redis:7-alpine',
            container_name: 'codeb-redis',
            command: 'redis-server --appendonly yes --requirepass codeb123',
            ports: ['6379:6379'],
            volumes: [
              'redis_data:/data'
            ],
            restart: 'unless-stopped',
            networks: ['codeb-network']
          }
        },
        volumes: {
          redis_data: {}
        },
        networks: {
          'codeb-network': {
            driver: 'bridge'
          }
        }
      };
      
      await fs.writeFile(
        path.join(podmanDir, 'docker-compose.redis.yml'),
        require('yaml').stringify(redisConfig)
      );
    }
    
    // 통합 docker-compose 파일
    await this.generateCombinedDockerCompose(podmanDir, options);
    
    // 초기화 스크립트
    await this.generateInitScripts(podmanDir, options);
  }

  /**
   * 통합 docker-compose 파일 생성
   */
  async generateCombinedDockerCompose(podmanDir, options) {
    const services = {};
    const volumes = {};
    const networks = {
      'codeb-network': {
        driver: 'bridge'
      }
    };
    
    // PostgreSQL 서비스 추가
    if (options.db === 'postgresql') {
      services.postgres = {
        image: 'postgres:15-alpine',
        container_name: 'codeb-postgres',
        environment: [
          'POSTGRES_DB=codeb_dev',
          'POSTGRES_USER=codeb',
          'POSTGRES_PASSWORD=codeb123'
        ],
        ports: ['5432:5432'],
        volumes: ['postgres_data:/var/lib/postgresql/data'],
        restart: 'unless-stopped',
        networks: ['codeb-network'],
        healthcheck: {
          test: ['CMD-SHELL', 'pg_isready -U codeb -d codeb_dev'],
          interval: '10s',
          timeout: '5s',
          retries: 5
        }
      };
      volumes.postgres_data = {};
    }
    
    // Redis 서비스 추가
    if (options.cache === 'redis') {
      services.redis = {
        image: 'redis:7-alpine',
        container_name: 'codeb-redis',
        command: 'redis-server --appendonly yes --requirepass codeb123',
        ports: ['6379:6379'],
        volumes: ['redis_data:/data'],
        restart: 'unless-stopped',
        networks: ['codeb-network'],
        healthcheck: {
          test: ['CMD', 'redis-cli', '--raw', 'incr', 'ping'],
          interval: '10s',
          timeout: '3s',
          retries: 5
        }
      };
      volumes.redis_data = {};
    }
    
    const dockerCompose = {
      version: '3.8',
      services,
      volumes,
      networks
    };
    
    await fs.writeFile(
      path.join(podmanDir, 'docker-compose.yml'),
      require('yaml').stringify(dockerCompose)
    );
  }

  /**
   * 초기화 스크립트 생성
   */
  async generateInitScripts(podmanDir, options) {
    const scriptsDir = path.join(podmanDir, 'scripts');
    await fs.ensureDir(scriptsDir);
    
    // 시작 스크립트
    const startScript = `#!/bin/bash

echo "🚀 CodeB 로컬 개발 환경 시작..."

# Docker Compose로 컨테이너 시작
docker-compose up -d

# 컨테이너 상태 확인
echo "⏳ 컨테이너 상태 확인 중..."
sleep 5

if docker-compose ps | grep -q "Up"; then
    echo "✅ 컨테이너가 성공적으로 시작되었습니다!"
    
    # 연결 테스트
    ${options.db === 'postgresql' ? 'echo "📊 PostgreSQL 연결 테스트..."' : ''}
    ${options.cache === 'redis' ? 'echo "🔄 Redis 연결 테스트..."' : ''}
    
    echo "🎯 로컬 개발 환경이 준비되었습니다!"
    echo ""
    echo "📋 연결 정보:"
    ${options.db === 'postgresql' ? 'echo "   PostgreSQL: localhost:5432 (codeb/codeb123)"' : ''}
    ${options.cache === 'redis' ? 'echo "   Redis: localhost:6379 (비밀번호: codeb123)"' : ''}
else
    echo "❌ 컨테이너 시작에 실패했습니다."
    docker-compose logs
fi
`;

    await fs.writeFile(path.join(scriptsDir, 'start.sh'), startScript);
    await fs.chmod(path.join(scriptsDir, 'start.sh'), '755');
    
    // 중지 스크립트
    const stopScript = `#!/bin/bash

echo "🛑 CodeB 로컬 개발 환경 중지..."
docker-compose down
echo "✅ 환경이 중지되었습니다."
`;

    await fs.writeFile(path.join(scriptsDir, 'stop.sh'), stopScript);
    await fs.chmod(path.join(scriptsDir, 'stop.sh'), '755');
    
    // 초기화 스크립트
    const resetScript = `#!/bin/bash

echo "🔄 CodeB 로컬 환경 초기화..."
docker-compose down -v
docker-compose up -d
echo "✅ 환경이 초기화되었습니다."
`;

    await fs.writeFile(path.join(scriptsDir, 'reset.sh'), resetScript);
    await fs.chmod(path.join(scriptsDir, 'reset.sh'), '755');
  }

  /**
   * 로컬 개발 환경 시작
   */
  async startDev(options) {
    await this.localDevManager.start(options);
  }

  /**
   * 서버 배포
   */
  async deploy(options) {
    await this.serverDeployer.deploy(options);
  }

  /**
   * 상태 확인
   */
  async checkStatus() {
    console.log(chalk.blue.bold('📊 CodeB 프로젝트 상태 확인'));
    
    // 로컬 환경 상태
    const localStatus = await this.localDevManager.checkStatus();
    console.log(chalk.cyan('🔧 로컬 환경:'), localStatus ? '✅ 실행 중' : '❌ 중지됨');
    
    // 프로젝트 정보
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      console.log(chalk.cyan('📦 프로젝트:'), packageJson.name);
      console.log(chalk.cyan('🏷️  버전:'), packageJson.version);
    }
  }

  /**
   * 설정 관리
   */
  async manageConfig(options) {
    await this.configManager.manage(options);
  }

  /**
   * 데이터베이스 관리
   */
  async manageDatabase(options) {
    await this.databaseManager.manage(options);
  }

  /**
   * 환경 변수 파일 생성
   */
  async generateEnvironmentFiles(projectPath, mode, options) {
    if (mode === 'local') {
      const localEnv = `# CodeB 로컬 개발 환경 설정
NODE_ENV=development
PORT=3000

# Database (로컬 Podman)
DATABASE_URL=postgresql://codeb:codeb123@localhost:5432/codeb_dev

# Redis (로컬 Podman)
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=codeb123

# 로컬 스토리지
STORAGE_TYPE=local
UPLOAD_DIR=./uploads

# JWT Secret (개발용)
JWT_SECRET=dev-secret-key-change-in-production
`;
      
      await fs.writeFile(path.join(projectPath, '.env.local'), localEnv);
    } else {
      const serverEnv = `# CodeB 서버 환경 설정 (프로덕션)
NODE_ENV=production
PORT=3000

# Database (서버 DB 사용)
DATABASE_URL=postgresql://username:password@db-server:5432/production_db

# Redis (서버 Redis 사용)
REDIS_URL=redis://redis-server:6379
REDIS_PASSWORD=production-redis-password

# Storage (S3, GCS 등)
STORAGE_TYPE=s3
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_BUCKET=your-bucket-name

# JWT Secret (프로덕션용)
JWT_SECRET=production-jwt-secret-key
`;
      
      await fs.writeFile(path.join(projectPath, '.env.example'), serverEnv);
    }
  }

  /**
   * 서버 배포 설정 생성
   */
  async generateServerConfig(projectPath, options) {
    // Dockerfile 생성
    const dockerfile = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

USER node

CMD ["npm", "start"]
`;

    await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfile);
    
    // .dockerignore 생성
    const dockerignore = `node_modules
npm-debug.log
.git
.DS_Store
*.md
.env*
.next
.cache
coverage
podman/
`;

    await fs.writeFile(path.join(projectPath, '.dockerignore'), dockerignore);
  }

  /**
   * 배포 설정 생성
   */
  async generateDeploymentConfig(projectPath, options) {
    // docker-compose.prod.yml 생성
    const prodCompose = {
      version: '3.8',
      services: {
        app: {
          build: '.',
          ports: ['3000:3000'],
          environment: [
            'NODE_ENV=production'
          ],
          restart: 'unless-stopped',
          depends_on: ['postgres', 'redis']
        },
        nginx: {
          image: 'nginx:alpine',
          ports: ['80:80', '443:443'],
          volumes: [
            './nginx.conf:/etc/nginx/nginx.conf',
            './ssl:/etc/nginx/ssl'
          ],
          depends_on: ['app'],
          restart: 'unless-stopped'
        }
      }
    };
    
    await fs.writeFile(
      path.join(projectPath, 'docker-compose.prod.yml'),
      require('yaml').stringify(prodCompose)
    );
  }
}

module.exports = CodeB;