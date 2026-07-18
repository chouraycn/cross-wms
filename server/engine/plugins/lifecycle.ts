import { logger } from '../../logger.js';
import type { PluginLifecycle, PluginManifest, PluginContext, PluginEvent } from './types.js';
import { pluginRuntimeRegistry } from './registry.js';
import { setPluginStatus } from './status.js';
import { recordPluginInstall, removePluginInstallRecord } from './installs.js';
import { checkPluginPermission, requestPermission } from './permissions.js';
import type { PluginPermission } from './permissions.js';
import { runInSandbox } from './sandbox.js';

/**
 * 插件生命周期管理 — 安装 / 启用 / 禁用 / 卸载 / 更新
 *
 * 与 server/engine/pluginRegistry.ts 的关系：
 * - pluginRegistry.ts 内部封装了 DB CRUD（enable 时读 DB → 解析 manifest → sandbox 执行 → 注册 tools）
 * - 本模块提供纯逻辑的状态机迁移与生命周期钩子编排，不直接读写 DB
 *   让测试可以在不依赖 DB 的情况下验证状态机正确性
 *
 * 状态机：
 *   installed ──enable──▶ enabling ──ok──▶ enabled
 *   enabled ──disable──▶ disabling ──ok──▶ disabled
 *   disabled ──uninstall──▶ uninstalled
 *   installed ──update──▶ updating ──ok──▶ installed（新版本）
 *   任意 ──error──▶ error
 */

export type LifecycleState =
  | 'installed'
  | 'enabling'
  | 'enabled'
  | 'disabling'
  | 'disabled'
  | 'uninstalling'
  | 'uninstalled'
  | 'updating'
  | 'error';

/** 允许的状态迁移 */
const TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
  installed: ['enabling', 'updating', 'uninstalling', 'error'],
  enabling: ['enabled', 'error'],
  enabled: ['disabling', 'updating', 'uninstalling', 'error'],
  disabling: ['disabled', 'error'],
  disabled: ['enabling', 'uninstalling', 'error'],
  uninstalling: ['uninstalled', 'error'],
  uninstalled: [],
  updating: ['installed', 'enabled', 'error'],
  error: ['enabling', 'disabling', 'uninstalling'],
};

const states = new Map<string, LifecycleState>();
const events = new Map<string, PluginEvent[]>();

function getState(pluginId: string): LifecycleState {
  return states.get(pluginId) ?? 'installed';
}

function setState(pluginId: string, state: LifecycleState): void {
  states.set(pluginId, state);
  const statusMap: LifecycleState extends never ? never : Partial<Record<LifecycleState, 'installed' | 'enabled' | 'disabled' | 'error' | 'updating'>> = {
    installed: 'installed',
    enabling: 'installed',
    enabled: 'enabled',
    disabling: 'enabled',
    disabled: 'disabled',
    uninstalling: 'disabled',
    uninstalled: 'disabled',
    updating: 'updating',
    error: 'error',
  };
  const mapped = statusMap[state];
  if (mapped) {
    setPluginStatus(pluginId, mapped);
  }
}

function recordEvent(pluginId: string, type: PluginEvent['type'], payload?: unknown): void {
  const event: PluginEvent = { type, pluginId, timestamp: Date.now(), payload };
  let list = events.get(pluginId);
  if (!list) {
    list = [];
    events.set(pluginId, list);
  }
  list.push(event);
  logger.debug(`[Plugins:Lifecycle] event ${type} for ${pluginId}`);
}

/**
 * 校验状态迁移是否合法。非法迁移抛出 Error。
 */
export function assertTransition(from: LifecycleState, to: LifecycleState): void {
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new Error(`[Plugins:Lifecycle] 非法状态迁移: ${from} → ${to}`);
  }
}

/**
 * 执行插件生命周期钩子（带沙箱保护）。
 */
export async function invokeLifecycleHook(
  pluginId: string,
  hookName: keyof PluginLifecycle,
  lifecycle: PluginLifecycle | undefined,
  context: PluginContext,
): Promise<void> {
  if (!lifecycle || typeof lifecycle[hookName] !== 'function') return;
  const fn = lifecycle[hookName]!.bind(lifecycle) as (context: PluginContext) => Promise<void> | void;
  const result = await runInSandbox(pluginId, async () => {
    await fn(context);
  }, {
    limits: { timeoutMs: 10_000 },
  });
  if (!result.ok) {
    throw new Error(`[Plugins:Lifecycle] ${pluginId}.${hookName} 失败: ${result.error}`);
  }
}

/**
 * 启用插件。
 *
 * 步骤：
 * 1. 校验状态机
 * 2. 检查 'tool.register' 等基础权限
 * 3. 调用 lifecycle.enable 钩子（带超时）
 * 4. 更新注册表与状态
 */
export async function enablePlugin(
  pluginId: string,
  options: {
    lifecycle?: PluginLifecycle;
    context: PluginContext;
    permissions?: PluginPermission[];
  },
): Promise<void> {
  const from = getState(pluginId);
  assertTransition(from, 'enabling');
  setState(pluginId, 'enabling');

  try {
    if (options.permissions) {
      for (const perm of options.permissions) {
        const has = checkPluginPermission(pluginId, perm);
        if (!has) {
          const granted = await requestPermission(pluginId, perm, `enablePlugin: ${pluginId}`);
          if (!granted) {
            throw new Error(`[Plugins:Lifecycle] 缺少权限 ${perm}: ${pluginId}`);
          }
        }
      }
    }

    await invokeLifecycleHook(pluginId, 'enable', options.lifecycle, options.context);
    setState(pluginId, 'enabled');
    pluginRuntimeRegistry.setStatus(pluginId, 'enabled');
    recordEvent(pluginId, 'activate');
  } catch (e) {
    setState(pluginId, 'error');
    recordEvent(pluginId, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * 禁用插件。
 */
export async function disablePlugin(
  pluginId: string,
  options: { lifecycle?: PluginLifecycle; context: PluginContext },
): Promise<void> {
  const from = getState(pluginId);
  assertTransition(from, 'disabling');
  setState(pluginId, 'disabling');

  try {
    await invokeLifecycleHook(pluginId, 'disable', options.lifecycle, options.context);
    setState(pluginId, 'disabled');
    pluginRuntimeRegistry.setStatus(pluginId, 'disabled');
  } catch (e) {
    setState(pluginId, 'error');
    recordEvent(pluginId, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * 安装插件（仅记录状态，DB 操作由 pluginRegistry.ts 处理）。
 */
export async function installPlugin(
  pluginId: string,
  options: {
    version: string;
    source?: string;
    sourceType?: 'zip' | 'git' | 'npm';
    installPath?: string;
    lifecycle?: PluginLifecycle;
    context: PluginContext;
  },
): Promise<void> {
  if (states.has(pluginId)) {
    throw new Error(`[Plugins:Lifecycle] 插件已安装: ${pluginId}`);
  }
  setState(pluginId, 'installed');
  recordPluginInstall({
    pluginId,
    version: options.version,
    installTime: Date.now(),
    source: options.source,
    sourceType: options.sourceType,
    installPath: options.installPath,
  });
  try {
    await invokeLifecycleHook(pluginId, 'install', options.lifecycle, options.context);
    recordEvent(pluginId, 'load');
  } catch (e) {
    setState(pluginId, 'error');
    recordEvent(pluginId, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * 卸载插件。
 */
export async function uninstallPlugin(
  pluginId: string,
  options: { lifecycle?: PluginLifecycle; context: PluginContext },
): Promise<void> {
  const from = getState(pluginId);
  assertTransition(from, 'uninstalling');
  setState(pluginId, 'uninstalling');

  try {
    await invokeLifecycleHook(pluginId, 'uninstall', options.lifecycle, options.context);
    setState(pluginId, 'uninstalled');
    pluginRuntimeRegistry.unregister(pluginId);
    removePluginInstallRecord(pluginId);
    recordEvent(pluginId, 'uninstall');
  } catch (e) {
    setState(pluginId, 'error');
    recordEvent(pluginId, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

/**
 * 更新插件。
 */
export async function updatePlugin(
  pluginId: string,
  options: {
    fromVersion: string;
    toVersion: string;
    manifest: PluginManifest;
    lifecycle?: PluginLifecycle;
    context: PluginContext;
  },
): Promise<void> {
  const from = getState(pluginId);
  assertTransition(from, 'updating');
  setState(pluginId, 'updating');
  pluginRuntimeRegistry.setStatus(pluginId, 'updating');

  try {
    await invokeLifecycleHook(pluginId, 'update', options.lifecycle, options.context);
    pluginRuntimeRegistry.setManifest(pluginId, options.manifest);
    recordPluginInstall({
      pluginId,
      version: options.toVersion,
      installTime: Date.now(),
    });
    const nextState: LifecycleState = from === 'enabled' ? 'enabled' : 'installed';
    setState(pluginId, nextState);
    pluginRuntimeRegistry.setStatus(pluginId, nextState === 'enabled' ? 'enabled' : 'installed');
    recordEvent(pluginId, 'update', { from: options.fromVersion, to: options.toVersion });
  } catch (e) {
    setState(pluginId, 'error');
    recordEvent(pluginId, 'error', e instanceof Error ? e.message : String(e));
    throw e;
  }
}

// ===================== 查询 =====================

export function getLifecycleState(pluginId: string): LifecycleState {
  return getState(pluginId);
}

export function getLifecycleEvents(pluginId: string): PluginEvent[] {
  return events.get(pluginId) ?? [];
}

export function listLifecycleStates(): Array<{ pluginId: string; state: LifecycleState }> {
  return Array.from(states.entries()).map(([pluginId, state]) => ({ pluginId, state }));
}

/**
 * 测试辅助：重置所有生命周期状态。
 */
export function resetLifecycleStateForTests(): void {
  states.clear();
  events.clear();
}
