/**
 * Caddy Service
 * Caddy 리버스 프록시 관리 서비스
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface CaddySite {
  name: string;
  domain: string;
  port: number;
  ssl: boolean;
  upstream?: string;
  headers?: Record<string, string>;
}

export interface CaddyConfig {
  sites: Record<string, CaddySite>;
  global?: {
    email?: string;
    adminEndpoint?: string;
  };
}

class CaddyService {
  private configPath = process.env.CADDY_CONFIG_PATH || "/etc/caddy/Caddyfile";
  private caddyBin = process.env.CADDY_BIN || "caddy";
  private adminApi = process.env.CADDY_ADMIN_API || "http://localhost:2019";

  // Caddy 사이트 추가
  async addSite(name: string, domain: string, port: number, ssl: boolean = true): Promise<void> {
    try {
      const site: CaddySite = {
        name,
        domain,
        port,
        ssl,
        upstream: `localhost:${port}`,
      };

      // 기존 설정 읽기
      const config = await this.loadConfig();
      config.sites[name] = site;

      // 설정 저장
      await this.saveConfig(config);
      
      // Caddy 재로드
      await this.reloadCaddy();

      console.log(`Site ${name} added: ${domain} -> localhost:${port}`);
    } catch (error) {
      console.error(`Failed to add site ${name}:`, error);
      throw new Error(`Failed to add site ${name}: ${error}`);
    }
  }

  // Caddy 사이트 제거
  async removeSite(name: string): Promise<void> {
    try {
      // 기존 설정 읽기
      const config = await this.loadConfig();
      
      if (!config.sites[name]) {
        throw new Error(`Site ${name} not found`);
      }

      delete config.sites[name];

      // 설정 저장
      await this.saveConfig(config);
      
      // Caddy 재로드
      await this.reloadCaddy();

      console.log(`Site ${name} removed`);
    } catch (error) {
      console.error(`Failed to remove site ${name}:`, error);
      throw new Error(`Failed to remove site ${name}: ${error}`);
    }
  }

  // Caddy 사이트 업데이트
  async updateSite(name: string, updates: Partial<CaddySite>): Promise<void> {
    try {
      // 기존 설정 읽기
      const config = await this.loadConfig();
      
      if (!config.sites[name]) {
        throw new Error(`Site ${name} not found`);
      }

      // 사이트 정보 업데이트
      config.sites[name] = {
        ...config.sites[name],
        ...updates,
      };

      // upstream 업데이트
      if (updates.port) {
        config.sites[name].upstream = `localhost:${updates.port}`;
      }

      // 설정 저장
      await this.saveConfig(config);
      
      // Caddy 재로드
      await this.reloadCaddy();

      console.log(`Site ${name} updated`);
    } catch (error) {
      console.error(`Failed to update site ${name}:`, error);
      throw new Error(`Failed to update site ${name}: ${error}`);
    }
  }

  // Caddy 재로드
  async reloadCaddy(): Promise<void> {
    try {
      // Admin API를 통한 설정 재로드
      const { stdout } = await execAsync(`${this.caddyBin} reload --config ${this.configPath}`);
      console.log("Caddy reloaded successfully");
      return;
    } catch (error) {
      console.warn("Admin API reload failed, trying service reload:", error);
      
      try {
        // 시스템 서비스 재로드 시도
        await execAsync("systemctl reload caddy");
        console.log("Caddy service reloaded successfully");
      } catch (serviceError) {
        console.warn("Service reload failed, trying process restart:", serviceError);
        
        try {
          // 프로세스 재시작 시도
          await execAsync("pkill -USR1 caddy");
          console.log("Caddy process reloaded successfully");
        } catch (processError) {
          console.error("All reload methods failed:", processError);
          throw new Error(`Failed to reload Caddy: ${processError}`);
        }
      }
    }
  }

  // Caddy 상태 확인
  async getStatus(): Promise<{ running: boolean; sites: number; version?: string }> {
    try {
      // Caddy 프로세스 확인
      const { stdout: psOutput } = await execAsync("pgrep -f caddy");
      const running = psOutput.trim().length > 0;

      if (!running) {
        return { running: false, sites: 0 };
      }

      // 버전 정보 조회
      let version: string | undefined;
      try {
        const { stdout: versionOutput } = await execAsync(`${this.caddyBin} version`);
        version = versionOutput.trim().split('\n')[0];
      } catch (error) {
        console.warn("Could not get Caddy version:", error);
      }

      // 설정된 사이트 수
      const config = await this.loadConfig();
      const sites = Object.keys(config.sites).length;

      return {
        running: true,
        sites,
        version,
      };
    } catch (error) {
      console.error("Failed to get Caddy status:", error);
      return { running: false, sites: 0 };
    }
  }

  // 사이트 목록 조회
  async getSites(): Promise<CaddySite[]> {
    try {
      const config = await this.loadConfig();
      return Object.values(config.sites);
    } catch (error) {
      console.error("Failed to get sites:", error);
      return [];
    }
  }

  // 특정 사이트 조회
  async getSite(name: string): Promise<CaddySite | null> {
    try {
      const config = await this.loadConfig();
      return config.sites[name] || null;
    } catch (error) {
      console.error(`Failed to get site ${name}:`, error);
      return null;
    }
  }

  // 설정 유효성 검사
  async validateConfig(): Promise<{ valid: boolean; errors?: string[] }> {
    try {
      const { stdout, stderr } = await execAsync(`${this.caddyBin} validate --config ${this.configPath}`);
      
      if (stderr && stderr.trim().length > 0) {
        return {
          valid: false,
          errors: stderr.split('\n').filter(line => line.trim().length > 0),
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation failed: ${error}`],
      };
    }
  }

  // Private: 설정 로드
  private async loadConfig(): Promise<CaddyConfig> {
    try {
      // JSON 형태의 메타데이터 파일이 있는지 확인
      const metaPath = `${this.configPath}.json`;
      
      try {
        const metaContent = await fs.readFile(metaPath, "utf-8");
        return JSON.parse(metaContent);
      } catch (error) {
        // 메타 파일이 없으면 빈 설정 생성
        return {
          sites: {},
          global: {
            email: process.env.CADDY_EMAIL || "admin@localhost",
            adminEndpoint: this.adminApi,
          },
        };
      }
    } catch (error) {
      console.error("Failed to load Caddy config:", error);
      throw new Error(`Failed to load Caddy config: ${error}`);
    }
  }

  // Private: 설정 저장
  private async saveConfig(config: CaddyConfig): Promise<void> {
    try {
      // 메타데이터를 JSON으로 저장
      const metaPath = `${this.configPath}.json`;
      await fs.writeFile(metaPath, JSON.stringify(config, null, 2));

      // Caddyfile 형태로 저장
      const caddyfile = this.generateCaddyfile(config);
      await fs.writeFile(this.configPath, caddyfile);

      console.log("Caddy config saved");
    } catch (error) {
      console.error("Failed to save Caddy config:", error);
      throw new Error(`Failed to save Caddy config: ${error}`);
    }
  }

  // Private: Caddyfile 생성
  private generateCaddyfile(config: CaddyConfig): string {
    let caddyfile = "";

    // 글로벌 설정
    if (config.global?.email) {
      caddyfile += `{\n\temail ${config.global.email}\n}\n\n`;
    }

    // 각 사이트 설정
    for (const [name, site] of Object.entries(config.sites)) {
      caddyfile += `# Site: ${name}\n`;
      caddyfile += `${site.domain} {\n`;
      
      // SSL 설정
      if (!site.ssl) {
        caddyfile += `\ttls off\n`;
      }

      // 리버스 프록시 설정
      caddyfile += `\treverse_proxy ${site.upstream}\n`;

      // 헤더 설정
      if (site.headers) {
        for (const [key, value] of Object.entries(site.headers)) {
          caddyfile += `\theader ${key} "${value}"\n`;
        }
      }

      // 기본 헤더들
      caddyfile += `\theader X-Forwarded-For {remote}\n`;
      caddyfile += `\theader X-Real-IP {remote}\n`;
      
      caddyfile += `}\n\n`;
    }

    return caddyfile;
  }

  // 설정 백업
  async backupConfig(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupPath = `${this.configPath}.backup.${timestamp}`;
      
      await fs.copyFile(this.configPath, backupPath);
      
      // 메타데이터도 백업
      const metaPath = `${this.configPath}.json`;
      const metaBackupPath = `${metaPath}.backup.${timestamp}`;
      
      try {
        await fs.copyFile(metaPath, metaBackupPath);
      } catch (error) {
        console.warn("Meta file backup failed (may not exist):", error);
      }

      console.log(`Config backed up to ${backupPath}`);
      return backupPath;
    } catch (error) {
      console.error("Failed to backup config:", error);
      throw new Error(`Failed to backup config: ${error}`);
    }
  }

  // 설정 복원
  async restoreConfig(backupPath: string): Promise<void> {
    try {
      await fs.copyFile(backupPath, this.configPath);
      
      // 메타데이터도 복원
      const metaBackupPath = `${backupPath.replace('.backup.', '.json.backup.')}`;
      const metaPath = `${this.configPath}.json`;
      
      try {
        await fs.copyFile(metaBackupPath, metaPath);
      } catch (error) {
        console.warn("Meta file restore failed (may not exist):", error);
      }

      await this.reloadCaddy();
      console.log(`Config restored from ${backupPath}`);
    } catch (error) {
      console.error("Failed to restore config:", error);
      throw new Error(`Failed to restore config: ${error}`);
    }
  }
}

export const caddyService = new CaddyService();