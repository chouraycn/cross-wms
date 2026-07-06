/**
 * 钩子系统 barrel 导出
 *
 * 统一导出 cross-wms 钩子系统的全部模块，对齐 openclaw/src/hooks 架构：
 *   types → policy → workspace → loader → hooks → install → update
 *
 * 用法：
 *   import { runHooks, createHookEvent, discoverWorkspaceHooks } from './hooks/index.js';
 */

// 类型定义
export type {
  HookSource,
  HookInstallSpec,
  HookMetadata,
  HookInvocationPolicy,
  ParsedHookFrontmatter,
  Hook,
  HookEntry,
  HookConfig,
  HookEligibilityContext,
  HookPolicy,
  HookEventType,
  HookEvent,
  HookHandler,
} from './types.js';

// 策略与优先级合并
export {
  HOOK_SOURCE_PRIORITIES,
  isHookEnabledByDefault,
  canHookOverride,
  resolveHookConfig,
  resolveHookEnableState,
  resolveHookEntries,
} from './policy.js';
export type { HookEnableStateReason } from './policy.js';

// 工作区钩子发现
export {
  discoverWorkspaceHooks,
  loadHookEntriesFromDir,
  parseHookFrontmatter,
  resolveHookMetadata,
  resolveHookInvocationPolicy,
  isPathInsideWithRealpath,
  openRootFileSync,
} from './workspace.js';
export type { HookWorkspaceConfig } from './workspace.js';

// 动态加载器
export {
  loadHookHandler,
  loadLegacyHookHandler,
  buildImportUrl,
  resolveExistingRealpath,
  registerInternalHook,
  unregisterInternalHook,
  resetHookRegistrations,
  loadedHookRegistrations,
  registerBuiltinHooks,
} from './loader.js';
export type { LoadedHookRegistration } from './loader.js';

// 公共 API 门面
export {
  createHookEvent,
  isAgentBootstrapEvent,
  hasHookListeners,
  runHooks,
  runHooksAround,
} from './hooks.js';

// 安装管理
export {
  installHook,
  uninstallHook,
  updateHook,
  resolveSafeInstallDir,
  dirExistsSync,
} from './install.js';
export type { InstallHookResult, InstallHookOptions } from './install.js';

// 更新
export {
  checkHookUpdate,
  performHookUpdate,
  compareVersions,
  readInstalledPackageVersion,
} from './update.js';
export type { HookUpdateStatus, HookUpdateOutcome } from './update.js';

// 内置钩子
export {
  commandLoggerHook,
  commandLoggerBootstrapHook,
  commandLoggerNewHook,
  commandLoggerCompleteHook,
  sessionMemoryHook,
  sessionMemoryCommandHook,
  sessionMemoryMessageHook,
  getSessionEntry,
  listActiveSessions,
  getSessionCount,
  cleanupInactiveSessions,
} from './builtin/index.js';
