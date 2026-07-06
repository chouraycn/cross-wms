/**
 * 钩子动态加载器
 *
 * 参考 openclaw/src/hooks/loader.ts 与 import-url.ts，动态加载钩子处理器模块。
 *
 * - 全局单例 loadedHookRegistrations：通过 Symbol.for 跨模块实例共享，防止 bundle 分片导致注册丢失。
 * - 导入 URL 构建 buildImportUrl：workspace/managed 钩子用 mtime cache-bust，bundled 钩子不可变跳过。
 * - realpath 校验 resolveExistingRealpath：确保加载路径真实存在。
 * - 边界检查 openRootFile：handler 路径必须位于钩子目录内。
 * - legacy 兼容：旧 config handler 路径必须 workspace-relative。
 * - 信任警告：workspace 和 managed 钩子加载时显式 warn。
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { logger } from '../../logger.js';
import { openRootFileSync } from './workspace.js';
import type { HookEntry, HookHandler, HookSource } from './types.js';

/** 已加载钩子注册项（用于重置时反向注销） */
export type LoadedHookRegistration = {
  event: string;
  handler: HookHandler;
};

/** 全局单例 Symbol 键：跨模块实例共享注册列表 */
const LOADED_HOOK_REGISTRATIONS_KEY = Symbol.for('cross-wms.loadedHookRegistrations');

/** 内部处理器注册表（事件键 → 处理器列表），同样为全局单例 */
const INTERNAL_HOOK_HANDLERS_KEY = Symbol.for('cross-wms.internalHookHandlers');

type HandlersMap = Map<string, HookHandler[]>;

/** 获取全局单例（按 Symbol.for 键），不存在则用工厂初始化 */
function resolveGlobalSingleton<T>(key: symbol, factory: () => T): T {
  const store = globalThis as Record<symbol, T>;
  if (store[key] === undefined) {
    store[key] = factory();
  }
  return store[key];
}

/** 已加载的钩子注册项（全局共享） */
export const loadedHookRegistrations: LoadedHookRegistration[] = resolveGlobalSingleton<
  LoadedHookRegistration[]
>(LOADED_HOOK_REGISTRATIONS_KEY, () => []);

/** 内部处理器注册表（全局共享） */
const handlers: HandlersMap = resolveGlobalSingleton<HandlersMap>(
  INTERNAL_HOOK_HANDLERS_KEY,
  () => new Map<string, HookHandler[]>(),
);

/** 注册一个钩子处理器到指定事件键 */
export function registerInternalHook(eventKey: string, handler: HookHandler): void {
  if (!handlers.has(eventKey)) {
    handlers.set(eventKey, []);
  }
  handlers.get(eventKey)!.push(handler);
}

/** 注销指定事件键上的某个处理器 */
export function unregisterInternalHook(eventKey: string, handler: HookHandler): void {
  const list = handlers.get(eventKey);
  if (!list) {
    return;
  }
  const idx = list.indexOf(handler);
  if (idx !== -1) {
    list.splice(idx, 1);
  }
  if (list.length === 0) {
    handlers.delete(eventKey);
  }
}

/** 重置所有已加载的钩子注册项（注销全部处理器） */
export function resetHookRegistrations(): void {
  while (loadedHookRegistrations.length > 0) {
    const registration = loadedHookRegistrations.pop();
    if (!registration) {
      continue;
    }
    unregisterInternalHook(registration.event, registration.handler);
  }
}

/** 不可变源集合：这些源的 handler 文件在安装间不变，跳过 cache-bust */
const IMMUTABLE_SOURCES: ReadonlySet<HookSource> = new Set<HookSource>(['bundled']);

/**
 * 构建钩子处理器的导入 URL
 *
 * bundled 钩子（随包发布）在安装间不可变，无需 cache-bust，便于 V8 复用模块缓存。
 * workspace/managed/plugin 钩子可能在重启间被编辑，追加 `?t=<mtime>&s=<size>` 使模块键反映磁盘变化。
 */
export function buildImportUrl(handlerPath: string, source: HookSource): string {
  const base = pathToFileURL(handlerPath).href;
  if (IMMUTABLE_SOURCES.has(source)) {
    return base;
  }
  try {
    const { mtimeMs, size } = fs.statSync(handlerPath);
    return `${base}?t=${mtimeMs}&s=${size}`;
  } catch {
    // stat 失败时回退到 Date.now() 保证新鲜度
    return `${base}?t=${Date.now()}`;
  }
}

/** realpath 校验：解析真实路径，失败返回 null */
export function resolveExistingRealpath(value: string): string | null {
  try {
    return fs.realpathSync(value);
  } catch {
    return null;
  }
}

/** 边界文件打开：在 rootPath 边界内打开文件，返回 fd 与路径 */
function openRootFile(params: {
  absolutePath: string;
  rootPath: string;
  boundaryLabel: string;
}): { ok: true; fd: number; path: string } | { ok: false } {
  return openRootFileSync(params);
}

/** workspace/managed 源加载时显式信任警告 */
function maybeWarnTrustedHookSource(source: HookSource): void {
  if (source === 'workspace') {
    logger.warn(
      '[hooks/loader] 正在将 workspace 钩子代码加载到进程内。workspace 钩子为可信本地代码。',
    );
    return;
  }
  if (source === 'managed') {
    logger.warn(
      '[hooks/loader] 正在将 managed 钩子代码加载到进程内。managed 钩子为可信本地代码。',
    );
  }
}

/** 从模块命名空间解析导出函数（默认 default，或指定名称） */
function resolveFunctionModuleExport(params: {
  mod: Record<string, unknown>;
  exportName?: string;
}): HookHandler | undefined {
  const explicit = params.exportName?.trim();
  if (explicit) {
    const candidate = params.mod[explicit];
    return typeof candidate === 'function' ? (candidate as HookHandler) : undefined;
  }
  const candidate = params.mod['default'];
  return typeof candidate === 'function' ? (candidate as HookHandler) : undefined;
}

/**
 * 加载单个钩子条目的处理器并注册到事件键
 *
 * 流程：realpath 校验 baseDir → 边界检查 handlerPath → 信任警告 →
 *      构建 import URL → 动态 import → 解析导出函数 → 按 metadata.events 注册。
 *
 * @returns 加载成功为 true，失败为 false
 */
export async function loadHookHandler(entry: HookEntry): Promise<boolean> {
  try {
    const hookBaseDir = resolveExistingRealpath(entry.hook.baseDir);
    if (!hookBaseDir) {
      logger.error(
        `[hooks/loader] 钩子 '${entry.hook.name}' 的 baseDir 已不可读: ${entry.hook.baseDir}`,
      );
      return false;
    }
    const opened = openRootFile({
      absolutePath: entry.hook.handlerPath,
      rootPath: hookBaseDir,
      boundaryLabel: 'hook directory',
    });
    if (!opened.ok) {
      logger.error(
        `[hooks/loader] 钩子 '${entry.hook.name}' 的 handler 路径未通过边界检查: ${entry.hook.handlerPath}`,
      );
      return false;
    }
    const safeHandlerPath = opened.path;
    fs.closeSync(opened.fd);
    maybeWarnTrustedHookSource(entry.hook.source);

    // 仅对可变源（workspace/managed/plugin）做 mtime cache-bust
    const importUrl = buildImportUrl(safeHandlerPath, entry.hook.source);
    const mod = (await import(importUrl)) as Record<string, unknown>;

    const exportName = entry.metadata?.export ?? 'default';
    const handler = resolveFunctionModuleExport({ mod, exportName });
    if (!handler) {
      logger.error(
        `[hooks/loader] 导出 '${exportName}'（来自 ${entry.hook.name}）不是函数`,
      );
      return false;
    }

    const events = entry.metadata?.events ?? [];
    if (events.length === 0) {
      logger.warn(`[hooks/loader] 钩子 '${entry.hook.name}' 的 metadata 中未定义 events`);
      return false;
    }

    for (const event of events) {
      registerInternalHook(event, handler);
      loadedHookRegistrations.push({ event, handler });
    }

    logger.debug(
      `[hooks/loader] 已注册钩子: ${entry.hook.name} -> ${events.join(', ')}${exportName !== 'default' ? ` (导出: ${exportName})` : ''}`,
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[hooks/loader] 加载钩子 ${entry.hook.name} 失败: ${message}`);
    return false;
  }
}

/** 判断相对路径是否为非空且位于 root 内部（用于 legacy 兼容校验） */
function isNonEmptyRelativePathInsideRoot(relativePath: string): boolean {
  return (
    relativePath !== '' &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

/**
 * 加载 legacy 配置中的 handler（向后兼容）
 *
 * legacy handler 路径必须为 workspace-relative（禁止绝对路径），且 realpath 后必须位于 workspaceDir 内。
 */
export async function loadLegacyHookHandler(params: {
  module: string;
  exportName?: string;
  event: string;
  workspaceDir: string;
}): Promise<boolean> {
  const { module: rawModule, event, workspaceDir } = params;
  try {
    const trimmed = rawModule.trim();
    if (!trimmed) {
      logger.error('[hooks/loader] legacy handler 模块路径为空');
      return false;
    }
    if (path.isAbsolute(trimmed)) {
      logger.error(
        `[hooks/loader] legacy handler 模块路径必须为 workspace-relative（收到绝对路径）: ${trimmed}`,
      );
      return false;
    }
    const baseDir = path.resolve(workspaceDir);
    const baseDirReal = resolveExistingRealpath(baseDir);
    if (!baseDirReal) {
      logger.error(`[hooks/loader] 加载钩子时 workspaceDir 已不可读: ${baseDir}`);
      return false;
    }
    const modulePath = path.resolve(baseDir, trimmed);
    const modulePathSafe = resolveExistingRealpath(modulePath);
    if (!modulePathSafe) {
      logger.error(`[hooks/loader] legacy handler 模块路径无法用 realpath 解析: ${trimmed}`);
      return false;
    }
    const rel = path.relative(baseDirReal, modulePathSafe);
    if (!isNonEmptyRelativePathInsideRoot(rel)) {
      logger.error(`[hooks/loader] legacy handler 模块路径必须位于 workspaceDir 内: ${trimmed}`);
      return false;
    }
    const opened = openRootFile({
      absolutePath: modulePathSafe,
      rootPath: baseDirReal,
      boundaryLabel: 'workspace directory',
    });
    if (!opened.ok) {
      logger.error(
        `[hooks/loader] legacy handler 模块路径未通过 workspaceDir 边界检查: ${trimmed}`,
      );
      return false;
    }
    const safeModulePath = opened.path;
    fs.closeSync(opened.fd);
    logger.warn(
      `[hooks/loader] 正在从 workspace 路径加载 legacy 钩子模块 ${trimmed}。legacy 钩子模块为可信本地代码。`,
    );

    // legacy handler 始终 workspace-relative，使用 mtime cache-bust
    const importUrl = buildImportUrl(safeModulePath, 'workspace');
    const mod = (await import(importUrl)) as Record<string, unknown>;
    const exportName = params.exportName ?? 'default';
    const handler = resolveFunctionModuleExport({ mod, exportName });
    if (!handler) {
      logger.error(`[hooks/loader] legacy 导出 '${exportName}'（来自 ${modulePath}）不是函数`);
      return false;
    }
    registerInternalHook(event, handler);
    loadedHookRegistrations.push({ event, handler });
    logger.debug(
      `[hooks/loader] 已注册 legacy 钩子: ${event} -> ${modulePath}${exportName !== 'default' ? `#${exportName}` : ''}`,
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`[hooks/loader] 从 ${rawModule} 加载 legacy 钩子失败: ${message}`);
    return false;
  }
}

export async function registerBuiltinHooks(): Promise<void> {
  const {
    commandLoggerHook,
    commandLoggerBootstrapHook,
    commandLoggerNewHook,
    commandLoggerCompleteHook,
    sessionMemoryHook,
    sessionMemoryCommandHook,
    sessionMemoryMessageHook,
  } = await import('./builtin/index.js');

  registerInternalHook('command', commandLoggerHook);
  loadedHookRegistrations.push({ event: 'command', handler: commandLoggerHook });

  registerInternalHook('command:bootstrap', commandLoggerBootstrapHook);
  loadedHookRegistrations.push({ event: 'command:bootstrap', handler: commandLoggerBootstrapHook });

  registerInternalHook('command:new', commandLoggerNewHook);
  loadedHookRegistrations.push({ event: 'command:new', handler: commandLoggerNewHook });

  registerInternalHook('command:complete', commandLoggerCompleteHook);
  loadedHookRegistrations.push({ event: 'command:complete', handler: commandLoggerCompleteHook });

  registerInternalHook('session', sessionMemoryHook);
  loadedHookRegistrations.push({ event: 'session', handler: sessionMemoryHook });

  registerInternalHook('command', sessionMemoryCommandHook);
  loadedHookRegistrations.push({ event: 'command', handler: sessionMemoryCommandHook });

  registerInternalHook('message', sessionMemoryMessageHook);
  loadedHookRegistrations.push({ event: 'message', handler: sessionMemoryMessageHook });

  logger.info('[hooks/loader] 已注册内置钩子: command-logger, session-memory');
}
