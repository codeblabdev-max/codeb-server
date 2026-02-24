/**
 * CodeB v8.2 - Work Task CLI Commands
 * Team Collaboration & Conflict Prevention
 *
 * we task create "제목" --project myapp --files src/auth.ts --priority high
 * we task list [--project myapp]
 * we task check --files src/auth.ts,src/db.ts
 * we task status <id>
 * we task update <id> --note "auth.ts 수정 완료"
 * we task done <id> [--pr 42]
 */

import chalk from 'chalk';
import ora from 'ora';

async function getMcpClient() {
  const mod = await import('../lib/mcp-client.js');
  return mod.mcpClient;
}

// ============================================================================
// task create
// ============================================================================

export async function taskCreate(title, options) {
  const { project, files, areas, priority, author, branch, description } = options;

  if (!title) {
    console.log(chalk.yellow('Usage: we task create "작업 제목" --project <name> --files <paths>'));
    return;
  }

  console.log(chalk.blue.bold('\n📋 작업 등록\n'));

  const spinner = ora('작업 등록 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const fileList = files
      ? files.split(',').map(f => ({ path: f.trim() }))
      : [];
    const areaList = areas ? areas.split(',').map(a => a.trim()) : [];

    const result = await mcpClient.callTool('task_create', {
      projectName: project || 'default',
      title,
      description: description || '',
      author: author || process.env.USER || 'unknown',
      branch: branch || undefined,
      priority: priority || 'medium',
      files: fileList,
      areas: areaList,
    });

    spinner.succeed('작업 등록 완료');

    if (result.success || result.task) {
      const task = result.task;
      console.log(chalk.green(`\n✅ Task #${task.id}: "${task.title}"`));
      console.log(chalk.gray(`   작업자: ${task.author}`));
      console.log(chalk.gray(`   상태: ${task.status}`));
      console.log(chalk.gray(`   우선순위: ${task.priority}`));
      if (task.affectedFiles?.length > 0) {
        console.log(chalk.gray(`   잠금 파일: ${task.affectedFiles.join(', ')}`));
      }
      if (result.warning) {
        console.log(chalk.yellow(`\n⚠️  ${result.warning}`));
      }
      console.log(chalk.cyan(`\n💡 작업 완료 시: we task done ${task.id}`));
    } else {
      console.log(chalk.red(`\n❌ ${result.error || 'Unknown error'}`));
    }

    return result;
  } catch (error) {
    spinner.fail('작업 등록 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// ============================================================================
// task list
// ============================================================================

export async function taskList(options) {
  const { project, status, author, all } = options;

  console.log(chalk.blue.bold('\n📋 작업 목록\n'));

  const spinner = ora('조회 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const result = await mcpClient.callTool('task_list', {
      projectName: project || undefined,
      activeOnly: !all,
      author: author || undefined,
      status: status ? status.split(',') : undefined,
    });

    spinner.succeed(`${result.total || 0}개 작업 조회`);

    const tasks = result.tasks || [];
    if (tasks.length === 0) {
      console.log(chalk.gray('\n  진행중인 작업이 없습니다.\n'));
      return result;
    }

    const statusIcon = {
      draft: '📝',
      in_progress: '🔨',
      pushed: '📤',
      deploying: '🚀',
      deployed: '✅',
      cancelled: '❌',
    };

    const priorityColor = {
      low: chalk.gray,
      medium: chalk.white,
      high: chalk.yellow,
      critical: chalk.red.bold,
    };

    console.log('');
    for (const task of tasks) {
      const icon = statusIcon[task.status] || '❓';
      const pColor = priorityColor[task.priority] || chalk.white;

      console.log(`  ${icon} ${chalk.bold(`#${task.id}`)} ${task.title}`);
      console.log(chalk.gray(`     ${task.author} | ${pColor(task.priority)} | ${task.status} | 🔒 ${task.filesLocked}개 파일`));
      if (task.affectedFiles?.length > 0) {
        console.log(chalk.gray(`     파일: ${task.affectedFiles.slice(0, 5).join(', ')}${task.affectedFiles.length > 5 ? '...' : ''}`));
      }
      console.log('');
    }

    return result;
  } catch (error) {
    spinner.fail('조회 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// ============================================================================
// task check — 충돌 확인
// ============================================================================

export async function taskCheck(options) {
  const { files, exclude } = options;

  if (!files) {
    console.log(chalk.yellow('Usage: we task check --files src/auth.ts,src/db.ts'));
    return;
  }

  console.log(chalk.blue.bold('\n🔍 충돌 확인\n'));

  const spinner = ora('충돌 체크 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const filePaths = files.split(',').map(f => f.trim());

    const result = await mcpClient.callTool('task_check', {
      files: filePaths,
      excludeTaskId: exclude ? parseInt(exclude) : undefined,
    });

    if (result.hasConflicts) {
      spinner.fail('충돌 감지!');
      console.log(chalk.red(`\n⛔ ${result.conflicts.length}개 작업과 충돌\n`));

      for (const conflict of result.conflicts) {
        const severityIcon = conflict.severity === 'high' ? '🔴' : conflict.severity === 'medium' ? '🟡' : '🟢';
        console.log(`  ${severityIcon} Task #${conflict.taskId}: "${conflict.title}"`);
        console.log(chalk.gray(`     작업자: ${conflict.author} | 상태: ${conflict.status}`));
        console.log(chalk.red(`     충돌 파일: ${conflict.conflictingFiles.join(', ')}`));
        console.log('');
      }

      console.log(chalk.yellow('💡 해당 작업이 배포 완료될 때까지 대기하세요.'));
    } else {
      spinner.succeed('충돌 없음');
      console.log(chalk.green(`\n✅ ${filePaths.length}개 파일 수정 가능합니다.\n`));
    }

    return result;
  } catch (error) {
    spinner.fail('충돌 확인 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// ============================================================================
// task status (get)
// ============================================================================

export async function taskStatus(id, options) {
  if (!id) {
    console.log(chalk.yellow('Usage: we task status <taskId>'));
    return;
  }

  console.log(chalk.blue.bold(`\n📋 Task #${id} 상세\n`));

  const spinner = ora('조회 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const result = await mcpClient.callTool('task_get', {
      taskId: parseInt(id),
    });

    spinner.succeed('조회 완료');

    if (!result.success && !result.task) {
      console.log(chalk.red(`\n❌ ${result.error || 'Task not found'}`));
      return;
    }

    const task = result.task;
    const files = result.files || [];

    console.log(chalk.bold(`\n  #${task.id}: ${task.title}`));
    console.log(chalk.gray(`  작업자: ${task.author}`));
    console.log(chalk.gray(`  상태: ${task.status} | 우선순위: ${task.priority}`));
    console.log(chalk.gray(`  프로젝트: ${task.projectName}`));
    if (task.branch) console.log(chalk.gray(`  브랜치: ${task.branch}`));
    if (task.prNumber) console.log(chalk.gray(`  PR: #${task.prNumber}`));
    console.log(chalk.gray(`  생성: ${task.createdAt}`));
    console.log(chalk.gray(`  수정: ${task.updatedAt}`));

    if (task.description) {
      console.log(chalk.cyan('\n  --- 설명 ---'));
      console.log(chalk.white(`  ${task.description.replace(/\n/g, '\n  ')}`));
    }

    if (files.length > 0) {
      console.log(chalk.cyan(`\n  --- 파일 잠금 (${files.length}개) ---`));
      for (const file of files) {
        const icon = file.status === 'locked' ? '🔒' : file.status === 'released' ? '🔓' : '✅';
        console.log(`  ${icon} ${file.filePath} [${file.status}]`);
        if (file.changeDescription) console.log(chalk.gray(`     ${file.changeDescription}`));
      }
    }

    if (task.progressNotes?.length > 0) {
      console.log(chalk.cyan(`\n  --- 진행 노트 (${task.progressNotes.length}개) ---`));
      for (const note of task.progressNotes.slice(-10)) {
        console.log(chalk.gray(`  [${note.timestamp}] ${note.note}`));
        if (note.filesChanged?.length > 0) {
          console.log(chalk.gray(`    파일: ${note.filesChanged.join(', ')}`));
        }
      }
    }

    console.log('');
    return result;
  } catch (error) {
    spinner.fail('조회 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// ============================================================================
// task update
// ============================================================================

export async function taskUpdate(id, options) {
  if (!id) {
    console.log(chalk.yellow('Usage: we task update <taskId> --note "진행 사항"'));
    return;
  }

  const spinner = ora('갱신 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const params = { taskId: parseInt(id) };

    if (options.note) params.note = options.note;
    if (options.status) params.status = options.status;
    if (options.priority) params.priority = options.priority;
    if (options.branch) params.branch = options.branch;
    if (options.pr) params.prNumber = parseInt(options.pr);
    if (options.title) params.title = options.title;
    if (options.description) params.description = options.description;
    if (options.filesChanged) params.filesChanged = options.filesChanged.split(',').map(f => f.trim());
    if (options.addFiles) {
      params.addFiles = options.addFiles.split(',').map(f => ({ path: f.trim() }));
    }

    const result = await mcpClient.callTool('task_update', params);

    spinner.succeed('갱신 완료');
    console.log(chalk.green(`\n✅ Task #${id} 갱신됨`));
    if (result.newLocksAdded > 0) {
      console.log(chalk.gray(`   새로 잠금된 파일: ${result.newLocksAdded}개`));
    }

    return result;
  } catch (error) {
    spinner.fail('갱신 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}

// ============================================================================
// task done (complete)
// ============================================================================

export async function taskDone(id, options) {
  if (!id) {
    console.log(chalk.yellow('Usage: we task done <taskId> [--pr 42]'));
    return;
  }

  console.log(chalk.blue.bold(`\n✅ Task #${id} 완료 처리\n`));

  const spinner = ora('완료 처리 중...').start();

  try {
    const mcpClient = await getMcpClient();
    const result = await mcpClient.callTool('task_complete', {
      taskId: parseInt(id),
      prNumber: options.pr ? parseInt(options.pr) : undefined,
      deployId: options.deployId || undefined,
    });

    if (result.success) {
      spinner.succeed('완료!');
      console.log(chalk.green(`\n✅ Task #${id} 완료`));
      console.log(chalk.gray(`   ${result.releasedFiles || 0}개 파일 잠금 해제`));
      console.log(chalk.cyan('\n💡 다른 팀원이 해당 파일을 수정할 수 있습니다.\n'));
    } else {
      spinner.fail('실패');
      console.log(chalk.red(`\n❌ ${result.error}`));
    }

    return result;
  } catch (error) {
    spinner.fail('완료 처리 실패');
    console.log(chalk.red(`\n❌ Error: ${error.message}`));
  }
}
