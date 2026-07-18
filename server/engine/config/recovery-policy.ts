// 移植自 openclaw/src/config/recovery-policy.ts
// 决定配置恢复何时使用快照、备份或默认值。
import type { ConfigFileSnapshot, ConfigValidationIssue } from './types/openclaw.js';

const PLUGIN_ENTRY_PATH_PREFIX = 'plugins.entries.';
const PLUGIN_POLICY_PATHS = new Set(['plugins.allow', 'plugins.deny']);
const COMPILED_RUNTIME_OUTPUT_DIAGNOSTIC = 'compiled runtime output';
const PLUGIN_DIAGNOSTIC_PREFIX_PATTERN = /^plugin\s+([^:\s]+):\s/u;
const PLUGIN_NOT_FOUND_PATTERN = /^plugin not found:\s*([^\s(]+)/u;

function isPluginsPath(path: string): boolean {
  return path === 'plugins' || path.startsWith('plugins.');
}

function isPluginEntryIssue(issue: ConfigValidationIssue): boolean {
  const path = issue.path.trim();
  if (!path.startsWith(PLUGIN_ENTRY_PATH_PREFIX)) {
    return false;
  }
  return path.slice(PLUGIN_ENTRY_PATH_PREFIX.length).trim().length > 0;
}

function isPluginPolicyIssue(issue: ConfigValidationIssue): boolean {
  return (
    PLUGIN_POLICY_PATHS.has(issue.path.trim()) &&
    issue.message.trim().startsWith('plugin not found:')
  );
}

/** 当问题由缺失编译运行时输出引起时返回 true。 */
export function isPluginPackagingRuntimeOutputIssue(issue: ConfigValidationIssue): boolean {
  const path = issue.path.trim();
  const message = issue.message.trim().toLowerCase();
  return isPluginsPath(path) && message.includes(COMPILED_RUNTIME_OUTPUT_DIAGNOSTIC);
}

function isPluginPackagingFalloutIssue(issue: ConfigValidationIssue): boolean {
  const path = issue.path.trim();
  const message = issue.message.trim();
  return isPluginsPath(path) && message.startsWith('plugin not found:');
}

function normalizePluginIssueId(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function extractPluginPackagingRuntimeOutputPluginId(issue: ConfigValidationIssue): string | null {
  if (!isPluginPackagingRuntimeOutputIssue(issue)) {
    return null;
  }
  return normalizePluginIssueId(
    PLUGIN_DIAGNOSTIC_PREFIX_PATTERN.exec(issue.message.trim())?.[1],
  );
}

function extractPluginNotFoundIssuePluginId(issue: ConfigValidationIssue): string | null {
  if (!isPluginPackagingFalloutIssue(issue)) {
    return null;
  }
  return normalizePluginIssueId(PLUGIN_NOT_FOUND_PATTERN.exec(issue.message.trim())?.[1]);
}

/**
 * 当无效配置快照仅被插件打包后续问题阻塞时返回 true。
 * 调用方可据此展示插件修复提示，而不是把用户配置视为损坏。
 */
export function isPluginPackagingRuntimeOutputInvalidConfigSnapshot(
  snapshot: Pick<ConfigFileSnapshot, 'valid' | 'issues' | 'legacyIssues'> &
    Partial<Pick<ConfigFileSnapshot, 'warnings'>>,
): boolean {
  if (snapshot.valid || (snapshot.legacyIssues?.length ?? 0) > 0 || snapshot.issues.length === 0) {
    return false;
  }
  const packagingIssues = [...snapshot.issues, ...(snapshot.warnings ?? [])].filter(
    isPluginPackagingRuntimeOutputIssue,
  );
  const packagingPluginIds = new Set(
    packagingIssues
      .map((issue) => extractPluginPackagingRuntimeOutputPluginId(issue))
      .filter((pluginId): pluginId is string => pluginId !== null),
  );
  return (
    packagingIssues.length > 0 &&
    snapshot.issues.every((issue) => {
      if (isPluginPackagingRuntimeOutputIssue(issue)) {
        return true;
      }
      // 缺失插件的后续问题必须属于发出打包错误的同一插件。
      const pluginId = extractPluginNotFoundIssuePluginId(issue);
      return pluginId !== null && packagingPluginIds.has(pluginId);
    })
  );
}

/**
 * 当无效配置快照完全由陈旧插件引用引起时返回 true。
 * 此类快照跳过整文件恢复，以便插件清理保留用户配置。
 */
export function isPluginLocalInvalidConfigSnapshot(
  snapshot: Pick<ConfigFileSnapshot, 'valid' | 'issues' | 'legacyIssues'>,
): boolean {
  if (snapshot.valid || snapshot.legacyIssues.length > 0 || snapshot.issues.length === 0) {
    return false;
  }
  return snapshot.issues.every((issue) => isPluginEntryIssue(issue) || isPluginPolicyIssue(issue));
}

/**
 * 判断无效快照是否适合整文件 last-known-good 恢复。
 * 插件局部失败保留当前文件，以便定向插件清理运行。
 */
export function shouldAttemptLastKnownGoodRecovery(
  snapshot: Pick<ConfigFileSnapshot, 'valid' | 'issues' | 'legacyIssues'>,
): boolean {
  if (snapshot.valid) {
    return false;
  }
  return !isPluginLocalInvalidConfigSnapshot(snapshot);
}
