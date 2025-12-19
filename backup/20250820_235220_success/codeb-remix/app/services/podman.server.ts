/**
 * Podman Service
 * Podman 컨테이너 관리 서비스
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import yaml from "js-yaml";

const execAsync = promisify(exec);

export interface PodConfig {
  name: string;
  template: string;
  database: string;
  cache: boolean;
  port: number;
  dbPort: number;
  redisPort: number;
}

class PodmanService {
  private storagePath = process.env.STORAGE_PATH || "/mnt/blockstorage";

  // Pod 설정 생성
  async generatePodConfig(config: PodConfig) {
    const podYaml = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: `project-${config.name}`,
        labels: {
          app: config.name,
          template: config.template,
        },
      },
      spec: {
        containers: [
          {
            name: "app",
            image: this.getAppImage(config.template),
            ports: [{ containerPort: 3000, hostPort: config.port }],
            env: [
              { name: "NODE_ENV", value: "production" },
              { name: "PORT", value: "3000" },
              {
                name: "DATABASE_URL",
                value: `postgresql://postgres:password@localhost:5432/${config.name}`,
              },
              {
                name: "REDIS_URL",
                value: config.cache ? "redis://localhost:6379" : "",
              },
            ],
            volumeMounts: [
              {
                name: "app-data",
                mountPath: "/app/data",
              },
            ],
          },
        ],
        volumes: [
          {
            name: "app-data",
            hostPath: {
              path: `${this.storagePath}/projects/${config.name}/data`,
            },
          },
        ],
      },
    };

    // PostgreSQL 컨테이너 추가
    if (config.database === "postgres") {
      podYaml.spec.containers.push({
        name: "postgres",
        image: "postgres:15-alpine",
        ports: [{ containerPort: 5432, hostPort: config.dbPort }],
        env: [
          { name: "POSTGRES_DB", value: config.name },
          { name: "POSTGRES_USER", value: "postgres" },
          { name: "POSTGRES_PASSWORD", value: this.generatePassword() },
        ],
        volumeMounts: [
          {
            name: "postgres-data",
            mountPath: "/var/lib/postgresql/data",
          },
        ],
      });

      podYaml.spec.volumes.push({
        name: "postgres-data",
        hostPath: {
          path: `${this.storagePath}/postgres/${config.name}`,
        },
      });
    }

    // Redis 컨테이너 추가
    if (config.cache) {
      podYaml.spec.containers.push({
        name: "redis",
        image: "redis:7-alpine",
        ports: [{ containerPort: 6379, hostPort: config.redisPort }],
        command: ["redis-server", "--appendonly", "yes"],
        volumeMounts: [
          {
            name: "redis-data",
            mountPath: "/data",
          },
        ],
      });

      podYaml.spec.volumes.push({
        name: "redis-data",
        hostPath: {
          path: `${this.storagePath}/redis/${config.name}`,
        },
      });
    }

    // YAML 파일로 저장
    const yamlPath = `/tmp/${config.name}-pod.yaml`;
    await fs.writeFile(yamlPath, yaml.dump(podYaml));

    return yamlPath;
  }

  // Pod 생성
  async createPod(name: string, configPath: string) {
    try {
      // 디렉토리 생성
      await this.createProjectDirectories(name);

      // Pod 생성
      const { stdout, stderr } = await execAsync(
        `podman play kube ${configPath}`
      );

      if (stderr && !stderr.includes("Warning")) {
        throw new Error(stderr);
      }

      return stdout;
    } catch (error) {
      console.error(`Failed to create pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 삭제
  async deletePod(name: string) {
    try {
      await execAsync(`podman pod stop project-${name}`);
      await execAsync(`podman pod rm project-${name}`);
      return true;
    } catch (error) {
      console.error(`Failed to delete pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 시작
  async startPod(name: string) {
    try {
      const { stdout } = await execAsync(`podman pod start project-${name}`);
      return stdout;
    } catch (error) {
      console.error(`Failed to start pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 중지
  async stopPod(name: string, graceful?: boolean) {
    try {
      const timeout = graceful ? "--timeout 30" : "";
      const { stdout } = await execAsync(
        `podman pod stop ${timeout} project-${name}`
      );
      return stdout;
    } catch (error) {
      console.error(`Failed to stop pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 재시작
  async restartPod(name: string) {
    try {
      const { stdout } = await execAsync(`podman pod restart project-${name}`);
      return stdout;
    } catch (error) {
      console.error(`Failed to restart pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 재생성
  async recreatePod(name: string) {
    try {
      await this.stopPod(name);
      await this.deletePod(name);
      // 설정 파일 다시 읽어서 생성
      const configPath = `/tmp/${name}-pod.yaml`;
      await this.createPod(name, configPath);
      return true;
    } catch (error) {
      console.error(`Failed to recreate pod ${name}:`, error);
      throw error;
    }
  }

  // Pod 상태 조회
  async getPodStatus(name: string) {
    try {
      const { stdout } = await execAsync(
        `podman pod ps --filter name=project-${name} --format json`
      );
      const pods = JSON.parse(stdout || "[]");
      return pods[0] || null;
    } catch (error) {
      console.error(`Failed to get pod status ${name}:`, error);
      return null;
    }
  }

  // 컨테이너 통계
  async getContainerStats(name: string) {
    try {
      const { stdout } = await execAsync(
        `podman stats --no-stream --format json project-${name}`
      );
      return JSON.parse(stdout || "{}");
    } catch (error) {
      console.error(`Failed to get container stats ${name}:`, error);
      return {};
    }
  }

  // 로그 조회
  async getLogs(name: string, options: { tail?: string; container?: string }) {
    try {
      const tail = options.tail || "100";
      const container = options.container || "app";
      const { stdout } = await execAsync(
        `podman logs --tail ${tail} project-${name}_${container}_1`
      );
      return stdout;
    } catch (error) {
      console.error(`Failed to get logs ${name}:`, error);
      return "";
    }
  }

  // 컨테이너에서 명령 실행
  async execInContainer(name: string, container: string, command: string) {
    try {
      const { stdout } = await execAsync(
        `podman exec project-${name}_${container}_1 ${command}`
      );
      return stdout;
    } catch (error) {
      console.error(`Failed to exec command in ${name}:`, error);
      throw error;
    }
  }

  // Pod 설정 복제
  async clonePodConfig(source: string, target: string) {
    const sourcePath = `/tmp/${source}-pod.yaml`;
    const targetPath = `/tmp/${target}-pod.yaml`;

    const content = await fs.readFile(sourcePath, "utf-8");
    const config = yaml.load(content) as any;

    // 이름 변경
    config.metadata.name = `project-${target}`;
    config.metadata.labels.app = target;

    // 포트 변경 (새로운 포트는 service에서 할당)
    
    await fs.writeFile(targetPath, yaml.dump(config));
    return targetPath;
  }

  // Pod 데이터 복사
  async copyPodData(source: string, target: string) {
    try {
      // rsync로 데이터 복사
      await execAsync(
        `rsync -av ${this.storagePath}/projects/${source}/ ${this.storagePath}/projects/${target}/`
      );
      
      // PostgreSQL 데이터 복사
      await execAsync(
        `rsync -av ${this.storagePath}/postgres/${source}/ ${this.storagePath}/postgres/${target}/`
      );
      
      // Redis 데이터 복사
      await execAsync(
        `rsync -av ${this.storagePath}/redis/${source}/ ${this.storagePath}/redis/${target}/`
      );
      
      return true;
    } catch (error) {
      console.error(`Failed to copy pod data from ${source} to ${target}:`, error);
      throw error;
    }
  }

  // 백업 생성
  async createBackup(name: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupId = `${name}-${timestamp}`;
    const backupPath = `${this.storagePath}/backups/${backupId}`;

    try {
      await fs.mkdir(backupPath, { recursive: true });
      
      // PostgreSQL 백업
      await execAsync(
        `podman exec project-${name}_postgres_1 pg_dump -U postgres ${name} > ${backupPath}/database.sql`
      );
      
      // 파일 백업
      await execAsync(
        `tar -czf ${backupPath}/files.tar.gz -C ${this.storagePath}/projects/${name} .`
      );
      
      return backupId;
    } catch (error) {
      console.error(`Failed to create backup for ${name}:`, error);
      throw error;
    }
  }

  // Helper: 프로젝트 디렉토리 생성
  private async createProjectDirectories(name: string) {
    const dirs = [
      `${this.storagePath}/projects/${name}/data`,
      `${this.storagePath}/projects/${name}/uploads`,
      `${this.storagePath}/postgres/${name}`,
      `${this.storagePath}/redis/${name}`,
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  // Helper: 앱 이미지 선택
  private getAppImage(template: string): string {
    const images: Record<string, string> = {
      node: "node:18-alpine",
      remix: "node:18-alpine",
      next: "node:18-alpine",
      python: "python:3.11-alpine",
      go: "golang:1.21-alpine",
    };
    return images[template] || "node:18-alpine";
  }

  // Helper: 비밀번호 생성
  private generatePassword(): string {
    return Math.random().toString(36).slice(-16);
  }
}

export const podmanService = new PodmanService();