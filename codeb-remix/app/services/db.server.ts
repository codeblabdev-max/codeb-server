/**
 * Database Service
 * Prisma ORM 데이터베이스 서비스 (JSON 파일 기반)
 */

import * as fs from "fs/promises";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";

// Project 인터페이스 (project.server.ts와 동일)
export interface Project {
  id: string;
  name: string;
  git_repository?: string;
  domain?: string;
  template: string;
  database_type: string;
  has_cache: boolean;
  ssl_enabled: boolean;
  port: number;
  db_port: number;
  redis_port: number;
  status: "creating" | "running" | "stopped" | "error";
  created_at: Date;
  updated_at: Date;
}

// API Key 인터페이스
export interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  permissions: "read" | "write" | "admin";
  active: boolean;
  last_used?: Date;
  expires_at?: Date;
  created_at: Date;
  updated_at: Date;
  created_by?: string;
}

// 데이터베이스 스키마
export interface DatabaseSchema {
  projects: Project[];
  apiKeys: ApiKey[];
  users?: any[];
  deployments?: any[];
  backups?: any[];
}

// Prisma 스타일 쿼리 인터페이스
export interface FindManyOptions<T> {
  where?: Partial<T>;
  orderBy?: { [K in keyof T]?: "asc" | "desc" };
  take?: number;
  skip?: number;
}

export interface FindUniqueOptions<T> {
  where: Partial<T>;
}

export interface CreateOptions<T> {
  data: Omit<T, "id" | "created_at" | "updated_at"> & {
    id?: string;
    created_at?: Date;
    updated_at?: Date;
  };
}

export interface UpdateOptions<T> {
  where: Partial<T>;
  data: Partial<T>;
}

export interface DeleteOptions<T> {
  where: Partial<T>;
}

// JSON 파일 기반 데이터베이스 클래스
class JsonDatabase {
  private dbPath: string;
  private data: DatabaseSchema = { projects: [], apiKeys: [] };
  private initialized = false;

  constructor() {
    this.dbPath = process.env.DATABASE_PATH || path.join(process.cwd(), "data", "database.json");
  }

  // 데이터베이스 초기화
  private async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // 데이터 디렉토리 생성
      const dataDir = path.dirname(this.dbPath);
      await fs.mkdir(dataDir, { recursive: true });

      // 기존 파일 로드 또는 새 파일 생성
      try {
        const content = await fs.readFile(this.dbPath, "utf-8");
        this.data = JSON.parse(content);
        
        // Date 객체 복원
        this.data.projects = this.data.projects.map(project => ({
          ...project,
          created_at: new Date(project.created_at),
          updated_at: new Date(project.updated_at),
        }));
      } catch (error) {
        // 파일이 없으면 빈 데이터베이스 생성
        console.log("Database file not found, creating new one");
        await this.save();
      }

      this.initialized = true;
      console.log(`Database initialized at ${this.dbPath}`);
    } catch (error) {
      console.error("Failed to initialize database:", error);
      throw new Error(`Failed to initialize database: ${error}`);
    }
  }

  // 데이터베이스 저장
  private async save(): Promise<void> {
    try {
      const content = JSON.stringify(this.data, null, 2);
      await fs.writeFile(this.dbPath, content, "utf-8");
    } catch (error) {
      console.error("Failed to save database:", error);
      throw new Error(`Failed to save database: ${error}`);
    }
  }

  // 백업 생성
  async backup(): Promise<string> {
    await this.init();
    
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${this.dbPath}.backup.${timestamp}`;
      
      await fs.copyFile(this.dbPath, backupPath);
      console.log(`Database backed up to ${backupPath}`);
      
      return backupPath;
    } catch (error) {
      console.error("Failed to backup database:", error);
      throw new Error(`Failed to backup database: ${error}`);
    }
  }

  // 백업 복원
  async restore(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.dbPath);
      
      // 데이터 다시 로드
      this.initialized = false;
      await this.init();
      
      console.log(`Database restored from ${backupPath}`);
    } catch (error) {
      console.error("Failed to restore database:", error);
      throw new Error(`Failed to restore database: ${error}`);
    }
  }

  // ApiKey 테이블 인터페이스
  apiKey = {
    // 여러 레코드 조회
    findMany: async (options: FindManyOptions<ApiKey> = {}): Promise<ApiKey[]> => {
      await this.init();
      
      let results = [...(this.data.apiKeys || [])];

      // where 조건 적용
      if (options.where) {
        results = results.filter(item => {
          return Object.entries(options.where!).every(([key, value]) => {
            if (value === undefined) return true;
            return item[key as keyof ApiKey] === value;
          });
        });
      }

      // orderBy 적용
      if (options.orderBy) {
        const [field, order] = Object.entries(options.orderBy)[0];
        results.sort((a, b) => {
          const aVal = a[field as keyof ApiKey];
          const bVal = b[field as keyof ApiKey];
          
          if (aVal === bVal) return 0;
          
          const comparison = aVal > bVal ? 1 : -1;
          return order === "desc" ? -comparison : comparison;
        });
      }

      // skip과 take 적용
      if (options.skip) {
        results = results.slice(options.skip);
      }
      if (options.take) {
        results = results.slice(0, options.take);
      }

      return results;
    },

    // 단일 레코드 조회
    findUnique: async (options: FindUniqueOptions<ApiKey>): Promise<ApiKey | null> => {
      await this.init();
      
      const result = (this.data.apiKeys || []).find(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof ApiKey] === value;
        });
      });

      return result || null;
    },

    // 레코드 생성
    create: async (options: CreateOptions<ApiKey>): Promise<ApiKey> => {
      await this.init();
      
      if (!this.data.apiKeys) {
        this.data.apiKeys = [];
      }
      
      const now = new Date();
      const newApiKey: ApiKey = {
        id: options.data.id || uuidv4(),
        created_at: options.data.created_at || now,
        updated_at: options.data.updated_at || now,
        ...options.data,
      } as ApiKey;

      this.data.apiKeys.push(newApiKey);
      await this.save();

      return newApiKey;
    },

    // 레코드 업데이트
    update: async (options: UpdateOptions<ApiKey>): Promise<ApiKey> => {
      await this.init();
      
      if (!this.data.apiKeys) {
        this.data.apiKeys = [];
      }
      
      const index = this.data.apiKeys.findIndex(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof ApiKey] === value;
        });
      });

      if (index === -1) {
        throw new Error("Record not found");
      }

      const updatedApiKey = {
        ...this.data.apiKeys[index],
        ...options.data,
        updated_at: new Date(),
      };

      this.data.apiKeys[index] = updatedApiKey;
      await this.save();

      return updatedApiKey;
    },

    // 레코드 삭제
    delete: async (options: DeleteOptions<ApiKey>): Promise<ApiKey> => {
      await this.init();
      
      if (!this.data.apiKeys) {
        this.data.apiKeys = [];
      }
      
      const index = this.data.apiKeys.findIndex(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof ApiKey] === value;
        });
      });

      if (index === -1) {
        throw new Error("Record not found");
      }

      const deletedApiKey = this.data.apiKeys[index];
      this.data.apiKeys.splice(index, 1);
      await this.save();

      return deletedApiKey;
    },
  };

  // Project 테이블 인터페이스
  project = {
    // 여러 레코드 조회
    findMany: async (options: FindManyOptions<Project> = {}): Promise<Project[]> => {
      await this.init();
      
      let results = [...this.data.projects];

      // where 조건 적용
      if (options.where) {
        results = results.filter(item => {
          return Object.entries(options.where!).every(([key, value]) => {
            if (value === undefined) return true;
            return item[key as keyof Project] === value;
          });
        });
      }

      // orderBy 적용
      if (options.orderBy) {
        const [field, order] = Object.entries(options.orderBy)[0];
        results.sort((a, b) => {
          const aVal = a[field as keyof Project];
          const bVal = b[field as keyof Project];
          
          if (aVal === bVal) return 0;
          
          const comparison = aVal > bVal ? 1 : -1;
          return order === "desc" ? -comparison : comparison;
        });
      }

      // skip과 take 적용
      if (options.skip) {
        results = results.slice(options.skip);
      }
      if (options.take) {
        results = results.slice(0, options.take);
      }

      return results;
    },

    // 단일 레코드 조회
    findUnique: async (options: FindUniqueOptions<Project>): Promise<Project | null> => {
      await this.init();
      
      const result = this.data.projects.find(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof Project] === value;
        });
      });

      return result || null;
    },

    // 레코드 생성
    create: async (options: CreateOptions<Project>): Promise<Project> => {
      await this.init();
      
      const now = new Date();
      const newProject: Project = {
        id: options.data.id || uuidv4(),
        created_at: options.data.created_at || now,
        updated_at: options.data.updated_at || now,
        ...options.data,
      } as Project;

      this.data.projects.push(newProject);
      await this.save();

      return newProject;
    },

    // 레코드 업데이트
    update: async (options: UpdateOptions<Project>): Promise<Project> => {
      await this.init();
      
      const index = this.data.projects.findIndex(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof Project] === value;
        });
      });

      if (index === -1) {
        throw new Error("Record not found");
      }

      const updatedProject = {
        ...this.data.projects[index],
        ...options.data,
        updated_at: new Date(),
      };

      this.data.projects[index] = updatedProject;
      await this.save();

      return updatedProject;
    },

    // 레코드 삭제
    delete: async (options: DeleteOptions<Project>): Promise<Project> => {
      await this.init();
      
      const index = this.data.projects.findIndex(item => {
        return Object.entries(options.where).every(([key, value]) => {
          return item[key as keyof Project] === value;
        });
      });

      if (index === -1) {
        throw new Error("Record not found");
      }

      const deletedProject = this.data.projects[index];
      this.data.projects.splice(index, 1);
      await this.save();

      return deletedProject;
    },

    // 레코드 수 조회
    count: async (options: FindManyOptions<Project> = {}): Promise<number> => {
      await this.init();
      
      if (!options.where) {
        return this.data.projects.length;
      }

      return this.data.projects.filter(item => {
        return Object.entries(options.where!).every(([key, value]) => {
          if (value === undefined) return true;
          return item[key as keyof Project] === value;
        });
      }).length;
    },

    // 첫 번째 레코드 조회
    findFirst: async (options: FindManyOptions<Project> = {}): Promise<Project | null> => {
      const results = await this.project.findMany({ ...options, take: 1 });
      return results[0] || null;
    },

    // 레코드 존재 여부 확인
    exists: async (options: FindUniqueOptions<Project>): Promise<boolean> => {
      const result = await this.project.findUnique(options);
      return result !== null;
    },
  };

  // 데이터베이스 통계
  async getStats() {
    await this.init();
    
    return {
      projects: this.data.projects.length,
      running_projects: this.data.projects.filter(p => p.status === "running").length,
      stopped_projects: this.data.projects.filter(p => p.status === "stopped").length,
      creating_projects: this.data.projects.filter(p => p.status === "creating").length,
      error_projects: this.data.projects.filter(p => p.status === "error").length,
      database_size: await this.getDatabaseSize(),
    };
  }

  // 데이터베이스 파일 크기 조회
  private async getDatabaseSize(): Promise<number> {
    try {
      const stats = await fs.stat(this.dbPath);
      return stats.size;
    } catch (error) {
      return 0;
    }
  }

  // 데이터베이스 최적화 (중복 제거, 정리)
  async optimize(): Promise<void> {
    await this.init();
    
    // 중복 프로젝트 제거 (name 기준)
    const uniqueProjects = new Map<string, Project>();
    
    for (const project of this.data.projects) {
      const existing = uniqueProjects.get(project.name);
      if (!existing || existing.updated_at < project.updated_at) {
        uniqueProjects.set(project.name, project);
      }
    }
    
    this.data.projects = Array.from(uniqueProjects.values());
    
    // 데이터 정렬 (created_at 기준 내림차순)
    this.data.projects.sort((a, b) => b.created_at.getTime() - a.created_at.getTime());
    
    await this.save();
    console.log("Database optimized");
  }

  // 데이터 검증
  async validate(): Promise<{ valid: boolean; errors: string[] }> {
    await this.init();
    
    const errors: string[] = [];

    // 프로젝트 검증
    for (const [index, project] of this.data.projects.entries()) {
      if (!project.id) {
        errors.push(`Project at index ${index} has no ID`);
      }
      
      if (!project.name) {
        errors.push(`Project at index ${index} has no name`);
      }
      
      if (!project.template) {
        errors.push(`Project ${project.name || index} has no template`);
      }
      
      if (!["creating", "running", "stopped", "error"].includes(project.status)) {
        errors.push(`Project ${project.name || index} has invalid status: ${project.status}`);
      }
      
      if (!(project.created_at instanceof Date) || isNaN(project.created_at.getTime())) {
        errors.push(`Project ${project.name || index} has invalid created_at date`);
      }
      
      if (!(project.updated_at instanceof Date) || isNaN(project.updated_at.getTime())) {
        errors.push(`Project ${project.name || index} has invalid updated_at date`);
      }
    }

    // 중복 이름 검사
    const names = new Set<string>();
    for (const project of this.data.projects) {
      if (names.has(project.name)) {
        errors.push(`Duplicate project name: ${project.name}`);
      }
      names.add(project.name);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// 데이터베이스 인스턴스 생성 및 내보내기
export const db = new JsonDatabase();