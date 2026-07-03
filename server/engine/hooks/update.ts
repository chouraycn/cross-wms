/**
 * 钩子更新
 *
 * 参考 openclaw/src/hooks/update.ts，实现版本比较与更新策略。
 *
 * - checkHookUpdate：比较已安装版本与源版本，返回更新状态（updated/unchanged/skipped/error）。
 * - performHookUpdate：执行实际更新，委托 install.ts 的 updateHook。
 *
 * 版本比较采用 semver 风格的数值比较（major.minor.patch），不依赖外部 semver 库。
 */

import fsp from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { updateHook, type InstallHookOptions } from './install.js';
import { parseHookFrontmatter } from './workspace.js';

/** 更新状态 */
export type HookUpdateStatus = 'updated' | 'unchanged' | 'skipped' | 'error';

/** 单个钩子更新结果 */
export type HookUpdateOutcome = {
  hookId: string;
  status: HookUpdateStatus;
  message: string;
  currentVersion?: string;
  nextVersion?: string;
};

/** 读取已安装钩子目录下 package.json 的 version 字段 */
export async function readInstalledPackageVersion(installPath: string): Promise<string | undefined> {
  const manifestPath = path.join(installPath, 'package.json');
  try {
    const raw = await fsp.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as { version?: string };
    return typeof manifest.version === 'string' ? manifest.version : undefined;
  } catch {
    return undefined;
  }
}

/** 从源钩子目录的 HOOK.md frontmatter 读取 version 字段 */
async function readSourceVersion(sourceDir: string): Promise<string | undefined> {
  const hookMdPath = path.join(sourceDir, 'HOOK.md');
  try {
    const raw = await fsp.readFile(hookMdPath, 'utf-8');
    const frontmatter = parseHookFrontmatter(raw);
    return frontmatter.version || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 比较两个版本号
 *
 * 支持 semver 风格（major.minor.patch）或单段版本号。
 * 返回：-1 表示 a < b，0 表示相等，1 表示 a > b。
 */
export function compareVersions(a: string, b: string): number {
  const partsA = a.split('.').map((s) => Number.parseInt(s, 10));
  const partsB = b.split('.').map((s) => Number.parseInt(s, 10));
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = Number.isNaN(partsA[i]) ? 0 : partsA[i];
    const vb = Number.isNaN(partsB[i]) ? 0 : partsB[i];
    if (va < vb) return -1;
    if (va > vb) return 1;
  }
  return 0;
}

/**
 * 检查钩子更新：比较已安装版本与源版本
 *
 * 返回更新结果，不实际执行更新。
 *
 * @param hookId - 钩子 ID
 * @param installedDir - 已安装钩子目录
 * @param sourceDir - 源钩子目录
 */
export async function checkHookUpdate(params: {
  hookId: string;
  installedDir: string;
  sourceDir: string;
}): Promise<HookUpdateOutcome> {
  const { hookId, installedDir, sourceDir } = params;
  try {
    const currentVersion = await readInstalledPackageVersion(installedDir);
    const nextVersion = await readSourceVersion(sourceDir);

    if (!currentVersion || !nextVersion) {
      // 缺少版本信息时视为需要更新
      return {
        hookId,
        status: 'updated',
        currentVersion,
        nextVersion,
        message: `钩子 "${hookId}" 缺少版本信息，将执行更新。`,
      };
    }

    const cmp = compareVersions(currentVersion, nextVersion);
    if (cmp === 0) {
      return {
        hookId,
        status: 'unchanged',
        currentVersion,
        nextVersion,
        message: `钩子 "${hookId}" 已是最新版本（${currentVersion}）。`,
      };
    }
    return {
      hookId,
      status: cmp < 0 ? 'updated' : 'skipped',
      currentVersion,
      nextVersion,
      message:
        cmp < 0
          ? `钩子 "${hookId}" 可更新: ${currentVersion} -> ${nextVersion}。`
          : `钩子 "${hookId}" 源版本（${nextVersion}）低于已安装版本（${currentVersion}），跳过。`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      hookId,
      status: 'error',
      message: `检查钩子 "${hookId}" 更新失败: ${message}`,
    };
  }
}

/**
 * 执行钩子更新
 *
 * 先 checkHookUpdate 判断是否需要更新，再委托 updateHook 执行复制覆盖。
 *
 * @param hookId - 钩子 ID
 * @param installedDir - 已安装钩子目录
 * @param sourceDir - 源钩子目录
 * @param options - 安装选项
 */
export async function performHookUpdate(params: {
  hookId: string;
  installedDir: string;
  sourceDir: string;
  options?: InstallHookOptions;
}): Promise<HookUpdateOutcome> {
  const { hookId, installedDir, sourceDir, options } = params;
  const check = await checkHookUpdate({ hookId, installedDir, sourceDir });

  if (check.status === 'unchanged') {
    logger.info(`[hooks/update] ${check.message}`);
    return check;
  }
  if (check.status === 'skipped') {
    logger.warn(`[hooks/update] ${check.message}`);
    return check;
  }
  if (check.status === 'error') {
    logger.error(`[hooks/update] ${check.message}`);
    return check;
  }

  // status === 'updated'：执行实际更新
  const result = await updateHook({ hookId, sourceDir, options });
  if (!result.ok) {
    return {
      hookId,
      status: 'error',
      currentVersion: check.currentVersion,
      nextVersion: check.nextVersion,
      message: `更新钩子 "${hookId}" 失败: ${result.error}`,
    };
  }

  logger.info(`[hooks/update] 已更新钩子 "${hookId}" -> ${result.targetDir}`);
  return {
    hookId,
    status: 'updated',
    currentVersion: check.currentVersion,
    nextVersion: check.nextVersion,
    message: `已更新钩子 "${hookId}"${check.currentVersion && check.nextVersion ? `: ${check.currentVersion} -> ${check.nextVersion}` : ''}。`,
  };
}
