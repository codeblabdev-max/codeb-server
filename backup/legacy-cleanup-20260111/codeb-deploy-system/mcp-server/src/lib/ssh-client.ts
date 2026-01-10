/**
 * CodeB Deploy MCP - SSH 클라이언트
 * 서버와의 모든 통신 담당
 */

import { Client, type ConnectConfig } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SSHConfig, SSHCommandResult } from './types.js';

export class SSHClient {
  private config: SSHConfig;
  private client: Client | null = null;
  private connected: boolean = false;

  constructor(config?: Partial<SSHConfig>) {
    this.config = {
      host: config?.host || process.env.CODEB_SERVER_HOST || '141.164.60.51',
      port: config?.port || 22,
      username: config?.username || process.env.CODEB_SERVER_USER || 'root',
      privateKeyPath: config?.privateKeyPath ||
                      process.env.CODEB_SSH_KEY_PATH ||
                      join(homedir(), '.ssh', 'id_rsa'),
    };
  }

  /**
   * SSH 연결
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.client = new Client();

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port,
        username: this.config.username,
        readyTimeout: 30000,
        keepaliveInterval: 10000,
      };

      // SSH 키 파일 확인
      if (this.config.privateKeyPath && existsSync(this.config.privateKeyPath)) {
        connectConfig.privateKey = readFileSync(this.config.privateKeyPath);
      } else if (this.config.password) {
        connectConfig.password = this.config.password;
      } else {
        reject(new Error(`SSH key not found: ${this.config.privateKeyPath}`));
        return;
      }

      this.client
        .on('ready', () => {
          this.connected = true;
          resolve();
        })
        .on('error', (err) => {
          this.connected = false;
          reject(err);
        })
        .on('close', () => {
          this.connected = false;
        })
        .connect(connectConfig);
    });
  }

  /**
   * 단일 명령 실행
   */
  async exec(command: string, timeout: number = 60000): Promise<SSHCommandResult> {
    const startTime = Date.now();

    if (!this.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Command timeout: ${command}`));
      }, timeout);

      this.client!.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          reject(err);
          return;
        }

        let stdout = '';
        let stderr = '';

        stream
          .on('close', (code: number) => {
            clearTimeout(timer);
            resolve({
              stdout: stdout.trim(),
              stderr: stderr.trim(),
              code,
              duration: Date.now() - startTime,
            });
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
          });
      });
    });
  }

  /**
   * 여러 명령 순차 실행
   */
  async execMultiple(commands: string[]): Promise<SSHCommandResult[]> {
    const results: SSHCommandResult[] = [];
    for (const command of commands) {
      results.push(await this.exec(command));
    }
    return results;
  }

  /**
   * 스크립트 파일 실행
   */
  async execScript(scriptPath: string, args: string[] = []): Promise<SSHCommandResult> {
    const command = `bash ${scriptPath} ${args.join(' ')}`;
    return this.exec(command, 300000); // 5분 타임아웃
  }

  /**
   * 파일 존재 확인
   */
  async fileExists(path: string): Promise<boolean> {
    const result = await this.exec(`test -f "${path}" && echo "exists" || echo "not found"`);
    return result.stdout === 'exists';
  }

  /**
   * 디렉토리 존재 확인
   */
  async dirExists(path: string): Promise<boolean> {
    const result = await this.exec(`test -d "${path}" && echo "exists" || echo "not found"`);
    return result.stdout === 'exists';
  }

  /**
   * 파일 내용 읽기
   */
  async readFile(path: string): Promise<string> {
    const result = await this.exec(`cat "${path}"`);
    if (result.code !== 0) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return result.stdout;
  }

  /**
   * 파일 쓰기 (heredoc 사용)
   */
  async writeFile(path: string, content: string): Promise<void> {
    // 디렉토리 생성
    const dir = path.substring(0, path.lastIndexOf('/'));
    await this.exec(`mkdir -p "${dir}"`);

    // heredoc으로 파일 작성
    const escapedContent = content.replace(/'/g, "'\\''");
    const result = await this.exec(`cat > "${path}" << 'CODEB_EOF'\n${content}\nCODEB_EOF`);

    if (result.code !== 0) {
      throw new Error(`Failed to write file: ${path}\n${result.stderr}`);
    }
  }

  /**
   * 디렉토리 생성
   */
  async mkdir(path: string): Promise<void> {
    await this.exec(`mkdir -p "${path}"`);
  }

  /**
   * 연결 종료
   */
  disconnect(): void {
    if (this.client) {
      this.client.end();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * 연결 테스트
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      const result = await this.exec('echo "connected"');
      return result.stdout === 'connected';
    } catch {
      return false;
    }
  }

  /**
   * 서버 정보 조회
   */
  getConfig(): SSHConfig {
    return { ...this.config };
  }

  /**
   * 연결 상태
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// 싱글톤 인스턴스
let defaultClient: SSHClient | null = null;

export function getSSHClient(config?: Partial<SSHConfig>): SSHClient {
  if (!defaultClient) {
    defaultClient = new SSHClient(config);
  }
  return defaultClient;
}

export function createSSHClient(config?: Partial<SSHConfig>): SSHClient {
  return new SSHClient(config);
}
