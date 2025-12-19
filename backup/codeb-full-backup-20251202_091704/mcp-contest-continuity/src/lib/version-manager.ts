/**
 * Document Version Manager
 * 
 * 문서 버전 관리 및 500줄 분할 시스템
 * - 자동 백업 및 버전 관리
 * - 500줄 초과 시 자동 페이지 분할
 * - 롤백 및 복구 기능
 */

import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';

interface DocumentVersion {
  version: string;
  timestamp: string;
  operation: 'CREATE' | 'UPDATE' | 'SPLIT' | 'MERGE' | 'ROLLBACK';
  file_path: string;
  line_count: number;
  hash: string;
  backup_path: string;
  description?: string;
}

interface DocumentMetadata {
  current_version: string;
  line_count: number;
  last_modified: string;
  auto_split: boolean;
  next_split_at: number;
  backup_count: number;
  split_history: string[];
}

interface VersionManagerOptions {
  max_versions: number;
  split_threshold: number;
  backup_enabled: boolean;
  auto_split: boolean;
}

export class DocumentVersionManager {
  private versionsDir: string;
  private backupDir: string;
  private options: VersionManagerOptions;

  constructor(
    baseDir: string = './document-versions',
    options: Partial<VersionManagerOptions> = {}
  ) {
    this.versionsDir = path.join(baseDir, 'versions');
    this.backupDir = path.join(baseDir, 'backups');
    this.options = {
      max_versions: 50,
      split_threshold: 500,
      backup_enabled: true,
      auto_split: true,
      ...options
    };
    
    this.ensureDirectories();
  }

  private async ensureDirectories(): Promise<void> {
    await fs.ensureDir(this.versionsDir);
    await fs.ensureDir(this.backupDir);
  }

  /**
   * 문서 백업 생성
   */
  async backupDocument(filePath: string, description?: string): Promise<string> {
    console.log(`[Version Manager] Creating backup for: ${filePath}`);
    
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    const hash = this.calculateHash(content);
    const version = this.generateVersion();
    const timestamp = new Date().toISOString();
    
    // 백업 파일 저장
    const backupFileName = `${path.basename(filePath, path.extname(filePath))}_v${version}${path.extname(filePath)}`;
    const backupPath = path.join(this.backupDir, backupFileName);
    await fs.writeFile(backupPath, content);
    
    // 버전 정보 저장
    const versionInfo: DocumentVersion = {
      version,
      timestamp,
      operation: 'CREATE',
      file_path: filePath,
      line_count: lineCount,
      hash,
      backup_path: backupPath,
      description
    };

    await this.saveVersionInfo(filePath, versionInfo);
    await this.updateMetadata(filePath, versionInfo);
    
    console.log(`[Version Manager] Backup created: ${version}`);
    return version;
  }

  /**
   * 문서 롤백
   */
  async rollbackDocument(filePath: string, targetVersion: string): Promise<void> {
    console.log(`[Version Manager] Rolling back ${filePath} to version ${targetVersion}`);
    
    const versionInfo = await this.getVersionInfo(filePath, targetVersion);
    if (!versionInfo) {
      throw new Error(`Version not found: ${targetVersion}`);
    }

    if (!await fs.pathExists(versionInfo.backup_path)) {
      throw new Error(`Backup file not found: ${versionInfo.backup_path}`);
    }

    // 현재 상태를 백업
    await this.backupDocument(filePath, `Rollback backup before restoring to ${targetVersion}`);
    
    // 롤백 실행
    const backupContent = await fs.readFile(versionInfo.backup_path, 'utf-8');
    await fs.writeFile(filePath, backupContent);
    
    // 롤백 기록
    const rollbackVersion: DocumentVersion = {
      ...versionInfo,
      version: this.generateVersion(),
      timestamp: new Date().toISOString(),
      operation: 'ROLLBACK',
      description: `Rolled back to version ${targetVersion}`
    };

    await this.saveVersionInfo(filePath, rollbackVersion);
    await this.updateMetadata(filePath, rollbackVersion);
    
    console.log(`[Version Manager] Rollback completed`);
  }

  /**
   * 500줄 분할 체크 및 실행
   */
  async checkAndSplit(filePath: string): Promise<{ split: boolean; pages?: string[] }> {
    if (!await fs.pathExists(filePath)) {
      return { split: false };
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const lineCount = content.split('\n').length;
    
    console.log(`[Version Manager] Checking ${filePath}: ${lineCount} lines`);
    
    if (lineCount <= this.options.split_threshold) {
      return { split: false };
    }

    if (!this.options.auto_split) {
      console.log(`[Version Manager] Auto-split disabled, manual split required`);
      return { split: false };
    }

    return await this.performAutoSplit(filePath, content);
  }

  /**
   * 자동 페이지 분할 실행
   */
  private async performAutoSplit(filePath: string, content: string): Promise<{ split: boolean; pages: string[] }> {
    console.log(`[Version Manager] Performing auto-split for: ${filePath}`);
    
    // 현재 파일 백업
    await this.backupDocument(filePath, 'Pre-split backup');
    
    const lines = content.split('\n');
    const pages = await this.splitIntoPages(lines, filePath);
    
    // 분할된 페이지들 저장
    const createdPages = [];
    
    for (let i = 0; i < pages.length; i++) {
      const pageContent = pages[i];
      let pagePath: string;
      
      if (i === 0) {
        // 첫 번째 페이지는 원본 파일 유지
        pagePath = filePath;
      } else {
        // 추가 페이지들 생성
        const baseName = path.basename(filePath, path.extname(filePath));
        const ext = path.extname(filePath);
        const dir = path.dirname(filePath);
        pagePath = path.join(dir, `${baseName}-page-${i + 1}${ext}`);
      }
      
      await fs.writeFile(pagePath, pageContent);
      createdPages.push(pagePath);
      
      // 각 페이지의 버전 정보 생성
      const pageVersion: DocumentVersion = {
        version: this.generateVersion(),
        timestamp: new Date().toISOString(),
        operation: 'SPLIT',
        file_path: pagePath,
        line_count: pageContent.split('\n').length,
        hash: this.calculateHash(pageContent),
        backup_path: '', // 분할 시에는 별도 백업 생성하지 않음
        description: `Auto-split page ${i + 1} of ${pages.length}`
      };
      
      await this.saveVersionInfo(pagePath, pageVersion);
      await this.updateMetadata(pagePath, pageVersion);
    }
    
    // 인덱스 페이지 생성
    await this.createIndexPage(filePath, createdPages);
    
    console.log(`[Version Manager] Auto-split completed: ${createdPages.length} pages created`);
    return { split: true, pages: createdPages };
  }

  /**
   * 페이지 분할 로직
   */
  private async splitIntoPages(lines: string[], originalFilePath: string): Promise<string[]> {
    const pages: string[] = [];
    let currentPage: string[] = [];
    let currentLineCount = 0;
    
    // 헤더 정보 추출 (첫 번째 페이지에서)
    const header = this.extractHeader(lines);
    const footer = this.generateSplitFooter(originalFilePath);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      currentPage.push(line);
      currentLineCount++;
      
      // 논리적 섹션 경계에서 분할 (500줄 근처)
      if (currentLineCount >= this.options.split_threshold - 50 && this.isLogicalBreakPoint(line, lines[i + 1])) {
        // 페이지 완성
        const pageContent = this.finalizePage(currentPage, header, footer, pages.length + 1);
        pages.push(pageContent);
        
        // 다음 페이지 준비
        currentPage = [...header]; // 헤더 복사
        currentLineCount = header.length;
      }
    }
    
    // 마지막 페이지 처리
    if (currentPage.length > 0) {
      const pageContent = this.finalizePage(currentPage, header, footer, pages.length + 1);
      pages.push(pageContent);
    }
    
    return pages;
  }

  /**
   * 논리적 분할 지점 판단
   */
  private isLogicalBreakPoint(currentLine: string, nextLine?: string): boolean {
    if (!nextLine) return true;
    
    // 마크다운 헤더로 분할
    if (nextLine.match(/^#{1,3} /)) return true;
    
    // 코드 블록 끝에서 분할
    if (currentLine.trim() === '```' && !nextLine.startsWith('```')) return true;
    
    // 구분선에서 분할
    if (currentLine.match(/^-{3,}$/)) return true;
    
    return false;
  }

  /**
   * 헤더 추출
   */
  private extractHeader(lines: string[]): string[] {
    const header = [];
    let inFrontMatter = false;
    
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i];
      
      // YAML front matter 처리
      if (i === 0 && line === '---') {
        inFrontMatter = true;
        header.push(line);
        continue;
      }
      
      if (inFrontMatter) {
        header.push(line);
        if (line === '---') {
          inFrontMatter = false;
        }
        continue;
      }
      
      // 메인 제목 (# Title)
      if (line.match(/^# /)) {
        header.push(line);
        break;
      }
      
      // 기타 중요 메타데이터
      if (line.includes('##') || line.includes('description:') || line.includes('author:')) {
        header.push(line);
      }
    }
    
    return header;
  }

  /**
   * 페이지 푸터 생성
   */
  private generateSplitFooter(originalFilePath: string): string[] {
    const baseName = path.basename(originalFilePath, path.extname(originalFilePath));
    return [
      '',
      '---',
      `**네비게이션**: [← 이전 페이지] | [다음 페이지 →] | [목차](${baseName}-index.md)`,
      `**자동 분할**: ${new Date().toISOString().split('T')[0]} | **원본**: ${originalFilePath}`,
      '---'
    ];
  }

  /**
   * 페이지 완성
   */
  private finalizePage(pageLines: string[], header: string[], footer: string[], pageNumber: number): string {
    const content = [...pageLines];
    
    // 페이지 정보 추가
    if (pageNumber > 1) {
      content.splice(header.length, 0, '', `## 📖 페이지 ${pageNumber}`, '');
    }
    
    // 푸터 추가
    content.push(...footer);
    
    return content.join('\n');
  }

  /**
   * 인덱스 페이지 생성
   */
  private async createIndexPage(originalFilePath: string, pages: string[]): Promise<void> {
    const baseName = path.basename(originalFilePath, path.extname(originalFilePath));
    const ext = path.extname(originalFilePath);
    const dir = path.dirname(originalFilePath);
    const indexPath = path.join(dir, `${baseName}-index${ext}`);
    
    let indexContent = `# ${baseName} 문서 인덱스\n\n`;
    indexContent += `## 📖 페이지 목록\n`;
    
    for (let i = 0; i < pages.length; i++) {
      const pagePath = pages[i];
      const pageTitle = i === 0 ? `페이지 1 (메인)` : `페이지 ${i + 1}`;
      const relativePath = path.relative(dir, pagePath);
      indexContent += `- [**${pageTitle}**](./${relativePath})\n`;
    }
    
    indexContent += `\n## 📊 분할 정보\n`;
    indexContent += `- **총 페이지**: ${pages.length}개\n`;
    indexContent += `- **분할 기준**: ${this.options.split_threshold}줄 초과\n`;
    indexContent += `- **분할 시점**: ${new Date().toISOString()}\n`;
    indexContent += `- **원본 파일**: ${originalFilePath}\n\n`;
    indexContent += `---\n`;
    indexContent += `**자동 생성**: MCP 문서 자동 분할 시스템\n`;
    
    await fs.writeFile(indexPath, indexContent);
    
    console.log(`[Version Manager] Index page created: ${indexPath}`);
  }

  /**
   * 버전 정보 저장
   */
  private async saveVersionInfo(filePath: string, versionInfo: DocumentVersion): Promise<void> {
    const versionFile = this.getVersionFilePath(filePath);
    
    let versions: DocumentVersion[] = [];
    if (await fs.pathExists(versionFile)) {
      versions = await fs.readJson(versionFile);
    }
    
    versions.push(versionInfo);
    
    // 최대 버전 수 제한
    if (versions.length > this.options.max_versions) {
      const excess = versions.length - this.options.max_versions;
      const removedVersions = versions.splice(0, excess);
      
      // 오래된 백업 파일 삭제
      for (const removedVersion of removedVersions) {
        if (removedVersion.backup_path && await fs.pathExists(removedVersion.backup_path)) {
          await fs.remove(removedVersion.backup_path);
        }
      }
    }
    
    await fs.writeJson(versionFile, versions, { spaces: 2 });
  }

  /**
   * 메타데이터 업데이트
   */
  private async updateMetadata(filePath: string, versionInfo: DocumentVersion): Promise<void> {
    const metadataFile = this.getMetadataFilePath(filePath);
    
    let metadata: DocumentMetadata = {
      current_version: versionInfo.version,
      line_count: versionInfo.line_count,
      last_modified: versionInfo.timestamp,
      auto_split: this.options.auto_split,
      next_split_at: this.options.split_threshold,
      backup_count: 1,
      split_history: []
    };
    
    if (await fs.pathExists(metadataFile)) {
      const existingMetadata = await fs.readJson(metadataFile);
      metadata = {
        ...existingMetadata,
        current_version: versionInfo.version,
        line_count: versionInfo.line_count,
        last_modified: versionInfo.timestamp,
        backup_count: existingMetadata.backup_count + 1
      };
    }
    
    if (versionInfo.operation === 'SPLIT') {
      metadata.split_history.push(versionInfo.timestamp);
    }
    
    await fs.writeJson(metadataFile, metadata, { spaces: 2 });
  }

  /**
   * 버전 리소스 접근
   */
  async getVersionResource(uri: string): Promise<any> {
    const uriParts = uri.replace('version-history://', '').split('/');
    const [resource, ...params] = uriParts;

    switch (resource) {
      case 'documents':
        return await this.getAllVersionHistory();
      case 'document':
        if (params[0]) {
          return await this.getDocumentVersions(params[0]);
        }
        break;
      case 'version':
        if (params[0] && params[1]) {
          return await this.getVersionDetails(params[0], params[1]);
        }
        break;
    }

    throw new Error(`Unknown version resource: ${uri}`);
  }

  // 헬퍼 메서드들
  private generateVersion(): string {
    return `v${Date.now().toString(36)}`;
  }

  private calculateHash(content: string): string {
    return createHash('md5').update(content).digest('hex');
  }

  private getVersionFilePath(filePath: string): string {
    const fileName = path.basename(filePath).replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.versionsDir, `${fileName}.versions.json`);
  }

  private getMetadataFilePath(filePath: string): string {
    const fileName = path.basename(filePath).replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.versionsDir, `${fileName}.metadata.json`);
  }

  private async getVersionInfo(filePath: string, version: string): Promise<DocumentVersion | null> {
    const versionFile = this.getVersionFilePath(filePath);
    
    if (!await fs.pathExists(versionFile)) {
      return null;
    }
    
    const versions: DocumentVersion[] = await fs.readJson(versionFile);
    return versions.find(v => v.version === version) || null;
  }

  private async getAllVersionHistory(): Promise<any> {
    const versionFiles = await fs.readdir(this.versionsDir);
    const allVersions = {};
    
    for (const file of versionFiles) {
      if (file.endsWith('.versions.json')) {
        const versions = await fs.readJson(path.join(this.versionsDir, file));
        const docName = file.replace('.versions.json', '');
        allVersions[docName] = versions;
      }
    }
    
    return { version_history: allVersions, mimeType: 'application/json' };
  }

  private async getDocumentVersions(docName: string): Promise<any> {
    const versionFile = path.join(this.versionsDir, `${docName}.versions.json`);
    
    if (await fs.pathExists(versionFile)) {
      const versions = await fs.readJson(versionFile);
      return { versions, mimeType: 'application/json' };
    }
    
    return { versions: [], mimeType: 'application/json' };
  }

  private async getVersionDetails(docName: string, version: string): Promise<any> {
    const versionFile = path.join(this.versionsDir, `${docName}.versions.json`);
    
    if (await fs.pathExists(versionFile)) {
      const versions: DocumentVersion[] = await fs.readJson(versionFile);
      const versionInfo = versions.find(v => v.version === version);
      
      if (versionInfo && versionInfo.backup_path && await fs.pathExists(versionInfo.backup_path)) {
        const content = await fs.readFile(versionInfo.backup_path, 'utf-8');
        return {
          version_info: versionInfo,
          content,
          mimeType: 'text/plain'
        };
      }
    }
    
    throw new Error(`Version details not found: ${docName}@${version}`);
  }
}