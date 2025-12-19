/**
 * Project Service
 * 프로젝트 관리 서비스 (서버 사이드)
 */

import { v4 as uuidv4 } from "uuid";
import { podmanService } from "./podman.server";
import { caddyService } from "./caddy.server";
import { db } from "./db.server";

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

export interface CreateProjectInput {
  name: string;
  git?: string;
  domain?: string;
  template?: string;
  database?: string;
  cache?: boolean;
  ssl?: boolean;
}

// 프로젝트 목록 조회
export async function getProjects({ all = false }: { all?: boolean }) {
  const projects = await db.project.findMany({
    where: all ? {} : { status: "running" },
    orderBy: { created_at: "desc" },
  });

  // Podman 상태 추가
  const projectsWithStatus = await Promise.all(
    projects.map(async (project) => {
      const podStatus = await podmanService.getPodStatus(project.name);
      return {
        ...project,
        runtime_status: podStatus,
      };
    })
  );

  return projectsWithStatus;
}

// 프로젝트 조회
export async function getProject(name: string) {
  return await db.project.findUnique({
    where: { name },
  });
}

// 프로젝트 생성
export async function createProject(input: CreateProjectInput) {
  // 중복 검사
  const existing = await db.project.findUnique({
    where: { name: input.name },
  });

  if (existing) {
    throw new Error("Project already exists");
  }

  // 포트 할당
  const projectCount = await db.project.count();
  const basePort = 3000 + projectCount;
  const dbPort = 5432 + projectCount;
  const redisPort = 6379 + projectCount;

  // DB에 프로젝트 생성
  const project = await db.project.create({
    data: {
      id: uuidv4(),
      name: input.name,
      git_repository: input.git,
      domain: input.domain,
      template: input.template || "node",
      database_type: input.database || "postgres",
      has_cache: input.cache !== false,
      ssl_enabled: input.ssl !== false,
      port: basePort,
      db_port: dbPort,
      redis_port: redisPort,
      status: "creating",
    },
  });

  // Pod 생성
  const podConfig = await podmanService.generatePodConfig({
    name: input.name,
    template: input.template || "node",
    database: input.database || "postgres",
    cache: input.cache !== false,
    port: basePort,
    dbPort,
    redisPort,
  });

  await podmanService.createPod(input.name, podConfig);

  // Caddy 설정 (도메인이 있는 경우)
  if (input.domain) {
    await caddyService.addSite(
      input.name,
      input.domain,
      basePort,
      input.ssl !== false
    );
  }

  // 상태 업데이트
  await db.project.update({
    where: { id: project.id },
    data: { status: "running" },
  });

  return project;
}

// 프로젝트 삭제
export async function deleteProject(name: string) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Pod 삭제
  await podmanService.deletePod(name);

  // Caddy 설정 제거
  if (project.domain) {
    await caddyService.removeSite(name);
  }

  // DB에서 삭제
  await db.project.delete({
    where: { name },
  });

  return { success: true };
}

// 프로젝트 시작
export async function startProject(name: string) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  await podmanService.startPod(name);

  await db.project.update({
    where: { name },
    data: { status: "running" },
  });

  return { success: true };
}

// 프로젝트 중지
export async function stopProject(name: string, options?: { graceful?: boolean }) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  await podmanService.stopPod(name, options?.graceful);

  await db.project.update({
    where: { name },
    data: { status: "stopped" },
  });

  return { success: true };
}

// 프로젝트 재시작
export async function restartProject(name: string, options?: { hard?: boolean }) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  if (options?.hard) {
    await podmanService.recreatePod(name);
  } else {
    await podmanService.restartPod(name);
  }

  return { success: true };
}

// 프로젝트 상태 조회
export async function getProjectStatus(name: string) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const podStatus = await podmanService.getPodStatus(name);
  const stats = await podmanService.getContainerStats(name);

  return {
    ...project,
    pod_status: podStatus,
    containers: stats,
  };
}

// 프로젝트 로그 조회
export async function getProjectLogs(
  name: string,
  options: { tail?: string; container?: string }
) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return await podmanService.getLogs(name, options);
}

// 프로젝트 복제
export async function cloneProject(
  source: string,
  target: string,
  options?: { skipData?: boolean; newDomain?: string }
) {
  const sourceProject = await db.project.findUnique({
    where: { name: source },
  });

  if (!sourceProject) {
    throw new Error("Source project not found");
  }

  const existingTarget = await db.project.findUnique({
    where: { name: target },
  });

  if (existingTarget) {
    throw new Error("Target project already exists");
  }

  // 새 포트 할당
  const projectCount = await db.project.count();
  const basePort = 3000 + projectCount;
  const dbPort = 5432 + projectCount;
  const redisPort = 6379 + projectCount;

  // 프로젝트 복제
  const targetProject = await db.project.create({
    data: {
      id: uuidv4(),
      name: target,
      git_repository: sourceProject.git_repository,
      domain: options?.newDomain || null,
      template: sourceProject.template,
      database_type: sourceProject.database_type,
      has_cache: sourceProject.has_cache,
      ssl_enabled: sourceProject.ssl_enabled,
      port: basePort,
      db_port: dbPort,
      redis_port: redisPort,
      status: "creating",
    },
  });

  // Pod 복제
  const podConfig = await podmanService.clonePodConfig(source, target);
  await podmanService.createPod(target, podConfig);

  if (!options?.skipData) {
    await podmanService.copyPodData(source, target);
  }

  await db.project.update({
    where: { id: targetProject.id },
    data: { status: "running" },
  });

  return targetProject;
}

// 백업 생성
export async function createBackup(name: string) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const backupId = await podmanService.createBackup(name);
  
  return {
    id: backupId,
    project: name,
    created_at: new Date(),
  };
}

// 명령 실행
export async function execCommand(
  name: string,
  container: string,
  command: string
) {
  const project = await db.project.findUnique({
    where: { name },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  return await podmanService.execInContainer(name, container, command);
}