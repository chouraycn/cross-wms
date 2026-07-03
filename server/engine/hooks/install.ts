/**
 * 钩子安装管理
 *
 * 参考 openclaw/src/hooks/install.ts，将钩子安装到 managed 目录或 workspace 目录。
 *
 * - installHook：从源目录复制钩子到目标目录，校验 HOOK.md 与 handler 文件存在。
 * - uninstallHook：移除已安装的钩子目录。
 * - updateHook：检查并执行钩子更新（委托 update.ts）。
 *
 * 安装目录校验 resolveSafeInstallDir 防止路径穿越；钩子 ID 不允许含路径分隔符。
 */

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { logger } from '../../logger.js';
import { parseHookFrontmatter } from './workspace.js';

/** 安装结果 */
export type InstallHookResult =
  | { ok: true; hookId: string; targetDir: string; hooks: string[] }
  | { ok: false; error: string };

/** 安装选项 */
export type InstallHookOptions = {
  /** 目标钩子根目录（默认 <configDir>/hooks） */
  hooksDir?: string;
  /** 安装模式：install 要求目标不存在，update 允许覆盖 */
  mode?: 'install' | 'update';
  /** 用户配置目录（默认 process.env.HOME/.config/cross-wms） */
  configDir?: string;
};

/** 校验钩子 ID：禁止空、保留路径段、路径分隔符 */
function validateHookId(hookId: string): string | null {
  if (!hookId) {
    return 'invalid hook name: missing';
  }
  if (hookId === '.' || hookId === '..') {
    return 'invalid hook name: reserved path segment';
  }
  if (hookId.includes('/') || hookId.includes('\\')) {
    return 'invalid hook name: path separators not allowed';
  }
  return null;
}

/** 解析默认的钩子根目录 */
function resolveDefaultHooksDir(configDir?: string): string {
  const base = configDir ?? path.join(process.env.HOME ?? '~', '.config', 'cross-wms');
  return path.join(base, 'hooks');
}

/**
 * 解析安全的安装目标目录（防止路径穿越）
 *
 * 钩子 ID 经校验后拼接至 hooksDir，并确保结果位于 hooksDir 内部。
 */
export function resolveSafeInstallDir(params: {
  baseDir: string;
  id: string;
}): { ok: true; path: string } | { ok: false; error: string } {
  const idError = validateHookId(params.id);
  if (idError) {
    return { ok: false, error: idError };
  }
  const target = path.resolve(params.baseDir, params.id);
  const relative = path.relative(params.baseDir, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, error: 'invalid hook name: path traversal detected' };
  }
  return { ok: true, path: target };
}

/** 递归复制目录 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fsp.copyFile(srcPath, destPath);
    }
  }
}

/** 校验钩子目录：必须含 HOOK.md 与 handler 候选文件之一 */
async function validateHookDir(hookDir: string): Promise<{ hookName: string; handlerEntry: string }> {
  const hookMdPath = path.join(hookDir, 'HOOK.md');
  try {
    await fsp.access(hookMdPath);
  } catch {
    throw new Error(`HOOK.md 缺失: ${hookDir}`);
  }
  const raw = await fsp.readFile(hookMdPath, 'utf-8');
  const frontmatter = parseHookFrontmatter(raw);
  const hookName = frontmatter.name || path.basename(hookDir);

  const handlerCandidates = ['handler.ts', 'handler.js', 'index.ts', 'index.js'];
  let handlerEntry: string | undefined;
  for (const candidate of handlerCandidates) {
    try {
      await fsp.access(path.join(hookDir, candidate));
      handlerEntry = candidate;
      break;
    } catch {
      // 继续尝试下一个候选
    }
  }
  if (!handlerEntry) {
    throw new Error(`handler.ts/handler.js/index.ts/index.js 缺失: ${hookDir}`);
  }
  return { hookName, handlerEntry };
}

/**
 * 安装钩子：从源目录复制到 managed 目录
 *
 * 源目录可为单个钩子目录（含 HOOK.md + handler）或含 package.json 声明的钩子包。
 * 安装模式为 install 时目标目录必须不存在；为 update 时允许覆盖。
 */
export async function installHook(params: {
  sourceDir: string;
  hookId?: string;
  options?: InstallHookOptions;
}): Promise<InstallHookResult> {
  const { sourceDir, options = {} } = params;
  const mode = options.mode ?? 'install';
  const hooksDir = options.hooksDir ?? resolveDefaultHooksDir(options.configDir);

  try {
    // 校验源目录并解析钩子名
    const { hookName } = await validateHookDir(sourceDir);
    const hookId = params.hookId ?? hookName;
    const idError = validateHookId(hookId);
    if (idError) {
      return { ok: false, error: idError };
    }

    const targetResult = resolveSafeInstallDir({ baseDir: hooksDir, id: hookId });
    if (!targetResult.ok) {
      return { ok: false, error: targetResult.error };
    }
    const targetDir = targetResult.path;

    // install 模式下目标不能已存在
    if (mode === 'install') {
      try {
        await fsp.access(targetDir);
        return { ok: false, error: `钩子已存在: ${targetDir}（请先删除或使用 update 模式）` };
      } catch {
        // 不存在，继续
      }
    }

    // 确保根目录存在并复制
    await fsp.mkdir(hooksDir, { recursive: true });
    if (mode === 'update') {
      // 更新模式先清空旧目录
      await fsp.rm(targetDir, { recursive: true, force: true });
    }
    await copyDir(sourceDir, targetDir);

    logger.info(`[hooks/install] 已安装钩子 '${hookId}' 到 ${targetDir}`);
    return { ok: true, hookId, targetDir, hooks: [hookName] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[hooks/install] 安装钩子失败: ${message}`);
    return { ok: false, error: message };
  }
}

/** 卸载钩子：移除目标目录 */
export async function uninstallHook(params: {
  hookId: string;
  options?: InstallHookOptions;
}): Promise<InstallHookResult> {
  const { hookId, options = {} } = params;
  const hooksDir = options.hooksDir ?? resolveDefaultHooksDir(options.configDir);
  const idError = validateHookId(hookId);
  if (idError) {
    return { ok: false, error: idError };
  }
  const targetResult = resolveSafeInstallDir({ baseDir: hooksDir, id: hookId });
  if (!targetResult.ok) {
    return { ok: false, error: targetResult.error };
  }
  const targetDir = targetResult.path;

  try {
    await fsp.access(targetDir);
  } catch {
    return { ok: false, error: `钩子未安装: ${hookId}` };
  }

  try {
    await fsp.rm(targetDir, { recursive: true, force: true });
    logger.info(`[hooks/install] 已卸载钩子 '${hookId}'（${targetDir}）`);
    return { ok: true, hookId, targetDir, hooks: [hookId] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[hooks/install] 卸载钩子失败: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * 更新钩子：委托 update.ts 的 performHookUpdate
 *
 * 此处为薄封装，保持 install 模块作为安装/卸载/更新的统一入口。
 */
export async function updateHook(params: {
  hookId: string;
  sourceDir: string;
  options?: InstallHookOptions;
}): Promise<InstallHookResult> {
  return installHook({
    sourceDir: params.sourceDir,
    hookId: params.hookId,
    options: { ...(params.options ?? {}), mode: 'update' },
  });
}

/** 判断目录是否存在（同步，用于安装前检查） */
export function dirExistsSync(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}
