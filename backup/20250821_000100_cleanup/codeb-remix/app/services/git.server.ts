/**
 * Git Service
 * Git 저장소 관리 서비스
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";

const execAsync = promisify(exec);

export interface GitRepository {
  name: string;
  url: string;
  branch: string;
  localPath: string;
  lastCommit?: string;
  lastPull?: Date;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  modified: string[];
  untracked: string[];
  staged: string[];
}

export interface CloneOptions {
  branch?: string;
  depth?: number;
  recursive?: boolean;
}

export interface PullOptions {
  rebase?: boolean;
  force?: boolean;
}

export interface PushOptions {
  force?: boolean;
  setUpstream?: boolean;
  tags?: boolean;
}

class GitService {
  private reposPath: string;

  constructor() {
    this.reposPath = process.env.GIT_REPOS_PATH || path.join(process.cwd(), "data", "repositories");
  }

  // 저장소 복제
  async clone(url: string, name: string, options: CloneOptions = {}): Promise<GitRepository> {
    try {
      // 저장소 디렉토리 생성
      await fs.mkdir(this.reposPath, { recursive: true });
      
      const localPath = path.join(this.reposPath, name);
      
      // 기존 디렉토리가 있으면 제거
      try {
        await fs.rm(localPath, { recursive: true, force: true });
      } catch (error) {
        // 디렉토리가 없으면 무시
      }

      // Git clone 명령어 구성
      let cloneCmd = `git clone ${url}`;
      
      if (options.branch) {
        cloneCmd += ` --branch ${options.branch}`;
      }
      
      if (options.depth) {
        cloneCmd += ` --depth ${options.depth}`;
      }
      
      if (options.recursive) {
        cloneCmd += ` --recursive`;
      }
      
      cloneCmd += ` "${localPath}"`;

      // 복제 실행
      const { stdout, stderr } = await execAsync(cloneCmd);
      
      if (stderr && !stderr.includes("Cloning into")) {
        throw new Error(stderr);
      }

      // 현재 브랜치와 커밋 정보 조회
      const branch = await this.getCurrentBranch(localPath);
      const lastCommit = await this.getLastCommitHash(localPath);

      const repository: GitRepository = {
        name,
        url,
        branch: branch || options.branch || "main",
        localPath,
        lastCommit,
        lastPull: new Date(),
      };

      console.log(`Repository ${name} cloned successfully`);
      return repository;
    } catch (error) {
      console.error(`Failed to clone repository ${name}:`, error);
      throw new Error(`Failed to clone repository ${name}: ${error}`);
    }
  }

  // 저장소 업데이트 (pull)
  async pull(name: string, options: PullOptions = {}): Promise<void> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      // Pull 명령어 구성
      let pullCmd = "git pull";
      
      if (options.rebase) {
        pullCmd += " --rebase";
      }
      
      if (options.force) {
        pullCmd += " --force";
      }

      // Pull 실행
      const { stdout, stderr } = await execAsync(pullCmd, {
        cwd: localPath,
      });

      if (stderr && !stderr.includes("Already up to date") && !stderr.includes("From ")) {
        throw new Error(stderr);
      }

      console.log(`Repository ${name} pulled successfully`);
    } catch (error) {
      console.error(`Failed to pull repository ${name}:`, error);
      throw new Error(`Failed to pull repository ${name}: ${error}`);
    }
  }

  // 저장소 푸시 (push)
  async push(name: string, options: PushOptions = {}): Promise<void> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      // Push 명령어 구성
      let pushCmd = "git push";
      
      if (options.setUpstream) {
        const branch = await this.getCurrentBranch(localPath);
        pushCmd += ` --set-upstream origin ${branch}`;
      }
      
      if (options.force) {
        pushCmd += " --force";
      }
      
      if (options.tags) {
        pushCmd += " --tags";
      }

      // Push 실행
      const { stdout, stderr } = await execAsync(pushCmd, {
        cwd: localPath,
      });

      if (stderr && !stderr.includes("To ") && !stderr.includes("Everything up-to-date")) {
        throw new Error(stderr);
      }

      console.log(`Repository ${name} pushed successfully`);
    } catch (error) {
      console.error(`Failed to push repository ${name}:`, error);
      throw new Error(`Failed to push repository ${name}: ${error}`);
    }
  }

  // 현재 브랜치 조회
  async getCurrentBranch(repositoryPath?: string): Promise<string | null> {
    try {
      const localPath = repositoryPath || this.reposPath;
      
      const { stdout } = await execAsync("git branch --show-current", {
        cwd: localPath,
      });

      return stdout.trim() || null;
    } catch (error) {
      console.error("Failed to get current branch:", error);
      return null;
    }
  }

  // 커밋 히스토리 조회
  async getCommitHistory(name: string, limit: number = 10): Promise<GitCommit[]> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      const { stdout } = await execAsync(
        `git log --pretty=format:"%H|%an|%ae|%ad|%s" --date=iso -n ${limit}`,
        { cwd: localPath }
      );

      if (!stdout.trim()) {
        return [];
      }

      return stdout
        .trim()
        .split("\n")
        .map((line) => {
          const [hash, author, email, date, message] = line.split("|");
          return {
            hash,
            author,
            email,
            date: new Date(date),
            message,
          };
        });
    } catch (error) {
      console.error(`Failed to get commit history for ${name}:`, error);
      return [];
    }
  }

  // Git 상태 조회
  async getStatus(name: string): Promise<GitStatus | null> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      // 브랜치 정보
      const branch = await this.getCurrentBranch(localPath) || "unknown";

      // 리모트와의 차이 조회
      let ahead = 0;
      let behind = 0;
      
      try {
        const { stdout: aheadBehind } = await execAsync(
          "git rev-list --left-right --count origin/HEAD...HEAD",
          { cwd: localPath }
        );
        const [behindStr, aheadStr] = aheadBehind.trim().split("\t");
        behind = parseInt(behindStr) || 0;
        ahead = parseInt(aheadStr) || 0;
      } catch (error) {
        console.warn("Could not get ahead/behind count:", error);
      }

      // 파일 상태 조회
      const { stdout: statusOutput } = await execAsync("git status --porcelain", {
        cwd: localPath,
      });

      const modified: string[] = [];
      const untracked: string[] = [];
      const staged: string[] = [];

      if (statusOutput.trim()) {
        statusOutput
          .trim()
          .split("\n")
          .forEach((line) => {
            const status = line.substring(0, 2);
            const filename = line.substring(3);

            if (status.startsWith("M") || status.startsWith(" M")) {
              modified.push(filename);
            } else if (status.startsWith("??")) {
              untracked.push(filename);
            } else if (status.startsWith("A") || status.startsWith("M ")) {
              staged.push(filename);
            }
          });
      }

      return {
        branch,
        ahead,
        behind,
        modified,
        untracked,
        staged,
      };
    } catch (error) {
      console.error(`Failed to get status for ${name}:`, error);
      return null;
    }
  }

  // 브랜치 전환
  async checkoutBranch(name: string, branchName: string, createNew: boolean = false): Promise<void> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      let checkoutCmd = `git checkout`;
      
      if (createNew) {
        checkoutCmd += ` -b`;
      }
      
      checkoutCmd += ` ${branchName}`;

      const { stderr } = await execAsync(checkoutCmd, {
        cwd: localPath,
      });

      if (stderr && !stderr.includes("Switched to") && !stderr.includes("Already on")) {
        throw new Error(stderr);
      }

      console.log(`Switched to branch ${branchName} in ${name}`);
    } catch (error) {
      console.error(`Failed to checkout branch ${branchName} in ${name}:`, error);
      throw new Error(`Failed to checkout branch ${branchName} in ${name}: ${error}`);
    }
  }

  // 변경사항 커밋
  async commit(name: string, message: string, addAll: boolean = false): Promise<string> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      // 파일 추가 (필요시)
      if (addAll) {
        await execAsync("git add .", { cwd: localPath });
      }

      // 커밋
      const { stdout } = await execAsync(`git commit -m "${message}"`, {
        cwd: localPath,
      });

      // 커밋 해시 추출
      const commitMatch = stdout.match(/\[.+?\s([a-f0-9]+)\]/);
      const commitHash = commitMatch ? commitMatch[1] : "";

      console.log(`Committed changes in ${name}: ${commitHash}`);
      return commitHash;
    } catch (error) {
      console.error(`Failed to commit in ${name}:`, error);
      throw new Error(`Failed to commit in ${name}: ${error}`);
    }
  }

  // 저장소 목록 조회
  async getRepositories(): Promise<GitRepository[]> {
    try {
      const repositories: GitRepository[] = [];
      
      const entries = await fs.readdir(this.reposPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const localPath = path.join(this.reposPath, entry.name);
          
          try {
            // Git 저장소인지 확인
            await this.validateRepository(localPath);
            
            // 저장소 정보 조회
            const url = await this.getRemoteUrl(localPath);
            const branch = await this.getCurrentBranch(localPath);
            const lastCommit = await this.getLastCommitHash(localPath);
            
            repositories.push({
              name: entry.name,
              url: url || "",
              branch: branch || "unknown",
              localPath,
              lastCommit,
            });
          } catch (error) {
            console.warn(`Skipping non-git directory: ${entry.name}`);
          }
        }
      }
      
      return repositories;
    } catch (error) {
      console.error("Failed to get repositories:", error);
      return [];
    }
  }

  // 저장소 삭제
  async deleteRepository(name: string): Promise<void> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      await fs.rm(localPath, { recursive: true, force: true });
      
      console.log(`Repository ${name} deleted`);
    } catch (error) {
      console.error(`Failed to delete repository ${name}:`, error);
      throw new Error(`Failed to delete repository ${name}: ${error}`);
    }
  }

  // Private: 저장소 유효성 검사
  private async validateRepository(localPath: string): Promise<void> {
    try {
      await fs.access(path.join(localPath, ".git"));
    } catch (error) {
      throw new Error("Not a valid git repository");
    }
  }

  // Private: 리모트 URL 조회
  private async getRemoteUrl(localPath: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git remote get-url origin", {
        cwd: localPath,
      });
      return stdout.trim() || null;
    } catch (error) {
      return null;
    }
  }

  // Private: 마지막 커밋 해시 조회
  private async getLastCommitHash(localPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execAsync("git rev-parse HEAD", {
        cwd: localPath,
      });
      return stdout.trim();
    } catch (error) {
      return undefined;
    }
  }

  // 저장소 동기화 (fetch + merge)
  async sync(name: string): Promise<void> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 저장소 존재 확인
      await this.validateRepository(localPath);

      // Fetch
      await execAsync("git fetch origin", { cwd: localPath });
      
      // Current branch merge
      const branch = await this.getCurrentBranch(localPath);
      if (branch) {
        await execAsync(`git merge origin/${branch}`, { cwd: localPath });
      }

      console.log(`Repository ${name} synchronized`);
    } catch (error) {
      console.error(`Failed to sync repository ${name}:`, error);
      throw new Error(`Failed to sync repository ${name}: ${error}`);
    }
  }

  // 저장소 초기화 (새 저장소 생성)
  async initRepository(name: string, bare: boolean = false): Promise<GitRepository> {
    try {
      const localPath = path.join(this.reposPath, name);
      
      // 디렉토리 생성
      await fs.mkdir(localPath, { recursive: true });

      // Git 초기화
      let initCmd = "git init";
      if (bare) {
        initCmd += " --bare";
      }

      await execAsync(initCmd, { cwd: localPath });

      const repository: GitRepository = {
        name,
        url: "",
        branch: bare ? "" : "main",
        localPath,
      };

      console.log(`Repository ${name} initialized`);
      return repository;
    } catch (error) {
      console.error(`Failed to init repository ${name}:`, error);
      throw new Error(`Failed to init repository ${name}: ${error}`);
    }
  }
}

export const gitService = new GitService();