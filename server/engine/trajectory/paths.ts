/**
 * 轨迹文件路径管理
 * 解析轨迹存储路径，支持环境变量覆盖、路径遍历防护、文件名安全化。
 * 参考 openclaw/src/trajectory/paths.ts 对齐实现。
 */
import path from 'node:path';
import fs from 'node:fs/promises';
import { resolveHomeDir } from '../daemon/paths.js';

const DEFAULT_TRAJECTORY_DIR_NAME = '.cdf-know';
const DEFAULT_TRAJECTORY_SUBDIR = 'trajectories';

export type TrajectoryPaths = {
  /** 轨迹根目录 */
  rootDir: string;
  /** 会话目录 */
  sessionDir: string;
  /** 轨迹条目文件（JSONL） */
  entryFile: string;
  /** 轨迹指针文件（sidecar pointer） */
  pointerFile: string;
};

/** 运行时轨迹捕获的最大字节数（默认 10MB） */
export const TRAJECTORY_RUNTIME_CAPTURE_MAX_BYTES = 10 * 1024 * 1024;
/** 单个轨迹文件的最大字节数（默认 50MB） */
export const TRAJECTORY_RUNTIME_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** 单个轨迹事件行的最大字节数（默认 256KB） */
export const TRAJECTORY_RUNTIME_EVENT_MAX_BYTES = 256 * 1024;

/** 将 sessionId 转为安全的文件名（防止路径遍历和特殊字符）。 */
export function safeTrajectorySessionFileName(sessionId: string): string {
  const safe = sessionId.replaceAll(/[^A-Za-z0-9_-]/g, '_').slice(0, 120);
  return /[A-Za-z0-9]/u.test(safe) ? safe : 'session';
}

/** 检查解析后的路径是否仍在 baseDir 内（路径遍历防护）。 */
function isPathInside(baseDir: string, targetPath: string): boolean {
  const resolvedBase = path.resolve(baseDir) + path.sep;
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedBase);
}

/** 在 baseDir 内解析安全路径（防止路径遍历）。 */
function resolveContainedPath(baseDir: string, fileName: string): string {
  const resolvedBase = path.resolve(baseDir);
  const resolvedFile = path.resolve(resolvedBase, fileName);
  if (resolvedFile === resolvedBase || !isPathInside(resolvedBase, resolvedFile)) {
    throw new Error('轨迹文件路径逃逸了其配置的目录');
  }
  return resolvedFile;
}

/**
 * 解析轨迹文件路径。
 * 支持环境变量 CDF_TRAJECTORY_DIR 覆盖，以及 sessionFile 旁的 sidecar 命名。
 */
export function resolveTrajectoryFilePath(params: {
  env?: Record<string, string | undefined>;
  sessionFile?: string;
  sessionId: string;
}): string {
  const env = params.env ?? process.env as Record<string, string | undefined>;
  const dirOverride = env.CDF_TRAJECTORY_DIR?.trim();
  if (dirOverride) {
    const baseDir = dirOverride.startsWith('~')
      ? dirOverride.replace(/^~/, resolveHomeDir(env))
      : dirOverride;
    return resolveContainedPath(
      path.resolve(baseDir),
      `${safeTrajectorySessionFileName(params.sessionId)}.jsonl`,
    );
  }
  if (!params.sessionFile) {
    return path.join(
      process.cwd(),
      `${safeTrajectorySessionFileName(params.sessionId)}.trajectory.jsonl`,
    );
  }
  return params.sessionFile.endsWith('.jsonl')
    ? `${params.sessionFile.slice(0, -'.jsonl'.length)}.trajectory.jsonl`
    : `${params.sessionFile}.trajectory.jsonl`;
}

/** 解析轨迹 sidecar 指针文件路径。 */
export function resolveTrajectoryPointerFilePath(sessionFile: string): string {
  return sessionFile.endsWith('.jsonl')
    ? `${sessionFile.slice(0, -'.jsonl'.length)}.trajectory-path.json`
    : `${sessionFile}.trajectory-path.json`;
}

/**
 * 解析轨迹路径（兼容旧接口）。
 * @deprecated 请使用 resolveTrajectoryFilePath
 */
export function resolveTrajectoryPath(sessionId: string, env?: Record<string, string | undefined>): TrajectoryPaths {
  const actualEnv = env ?? process.env as Record<string, string | undefined>;
  const dirOverride = actualEnv.CDF_TRAJECTORY_DIR?.trim();
  const home = resolveHomeDir(actualEnv);
  const rootDir = dirOverride
    ? path.resolve(dirOverride.startsWith('~') ? dirOverride.replace(/^~/, home) : dirOverride)
    : path.join(home, DEFAULT_TRAJECTORY_DIR_NAME, DEFAULT_TRAJECTORY_SUBDIR);
  const safeName = safeTrajectorySessionFileName(sessionId);
  const sessionDir = path.join(rootDir, safeName);
  const entryFile = path.join(sessionDir, 'trajectory.jsonl');
  const pointerFile = path.join(sessionDir, 'trajectory-path.json');
  return { rootDir, sessionDir, entryFile, pointerFile };
}

/** 确保轨迹目录存在。 */
export async function ensureTrajectoryDir(sessionId: string, env?: Record<string, string | undefined>): Promise<TrajectoryPaths> {
  const paths = resolveTrajectoryPath(sessionId, env);
  await fs.mkdir(paths.sessionDir, { recursive: true, mode: 0o700 });
  return paths;
}
