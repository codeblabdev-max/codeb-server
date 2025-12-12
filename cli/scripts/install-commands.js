#!/usr/bin/env node

/**
 * /we: Claude Code 명령어 설치 스크립트
 *
 * npm install 또는 npm link 시 자동으로 실행됩니다.
 * ~/.claude/commands/we/ 디렉토리에 명령어 파일을 복사합니다.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMANDS_SOURCE = path.join(__dirname, '..', 'commands', 'we');
const CLAUDE_COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands', 'we');

async function installCommands() {
  console.log('\n🚀 /we: Claude Code 명령어 설치 중...\n');

  try {
    // 소스 디렉토리 확인
    try {
      await fs.access(COMMANDS_SOURCE);
    } catch {
      console.log('⚠️  명령어 소스 디렉토리가 없습니다. 건너뜁니다.');
      return;
    }

    // 대상 디렉토리 생성
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });

    // 명령어 파일 복사
    const files = await fs.readdir(COMMANDS_SOURCE);
    const mdFiles = files.filter(f => f.endsWith('.md'));

    if (mdFiles.length === 0) {
      console.log('⚠️  설치할 명령어 파일이 없습니다.');
      return;
    }

    let installed = 0;
    let skipped = 0;

    for (const file of mdFiles) {
      const srcPath = path.join(COMMANDS_SOURCE, file);
      const destPath = path.join(CLAUDE_COMMANDS_DIR, file);

      try {
        // 기존 파일 체크 (덮어쓰기)
        await fs.copyFile(srcPath, destPath);
        installed++;
        console.log(`  ✅ ${file}`);
      } catch (err) {
        console.log(`  ❌ ${file}: ${err.message}`);
        skipped++;
      }
    }

    console.log(`\n📦 설치 완료: ${installed}개 명령어`);
    if (skipped > 0) {
      console.log(`⚠️  건너뜀: ${skipped}개`);
    }

    console.log('\n📍 설치 위치: ~/.claude/commands/we/');
    console.log('\n🎯 사용 가능한 명령어:');
    console.log('   /we:analyze   - 프로젝트 분석');
    console.log('   /we:deploy    - 프로젝트 배포');
    console.log('   /we:workflow  - CI/CD 워크플로우 생성');
    console.log('   /we:health    - 시스템 상태 점검');
    console.log('   /we:domain    - 도메인 관리');
    console.log('   /we:rollback  - 배포 롤백');
    console.log('   /we:monitor   - 실시간 모니터링');
    console.log('   /we:ssh       - SSH 키 관리');
    console.log('   /we:agent     - 7-Agent 직접 호출');
    console.log('   /we:optimize  - 프로젝트 최적화');
    console.log('\n');

  } catch (err) {
    console.error('❌ 설치 중 오류:', err.message);
    // 설치 실패해도 npm install은 계속 진행
    process.exit(0);
  }
}

// postinstall에서 실행될 때 자동 호출
installCommands().catch(console.error);
