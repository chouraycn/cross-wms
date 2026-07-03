/**
 * 钩子策略与优先级合并
 *
 * 参考 openclaw/src/hooks/policy.ts，实现四源优先级、非对称覆盖规则与钩子合并。
 *
 * 四源优先级（数值越小越高）：
 *   bundled(10, default-on) → plugin(20, default-on) → managed(30, default-on) → workspace(40, explicit-opt-in)
 *
 * 覆盖非对称规则：canOverride 与 canBeOverriddenBy 必须双向同意，单方高优先级不足以覆盖。
 * workspace 钩子默认禁用（安全第一），必须显式 enabled: true 才会启用。
 * plugin 钩子总是启用（不受 config.enabled 控制）。
 */

import type { HookConfig, HookEntry, HookPolicy, HookSource } from './types.js';

/** 钩子被禁用时的原因 */
export type HookEnableStateReason = 'disabled in config' | 'workspace hook (disabled by default)';

type HookEnableState = {
  enabled: boolean;
  reason?: HookEnableStateReason;
};

/** 各来源的策略表：优先级、可信度、默认启用模式与双向覆盖规则 */
const HOOK_SOURCE_POLICIES: Record<HookSource, HookPolicy> = {
  bundled: {
    precedence: 10,
    trustedLocalCode: true,
    defaultEnableMode: 'default-on',
    canOverride: ['bundled'],
    canBeOverriddenBy: ['managed', 'plugin'],
  },
  plugin: {
    precedence: 20,
    trustedLocalCode: true,
    defaultEnableMode: 'default-on',
    canOverride: ['bundled', 'plugin'],
    canBeOverriddenBy: ['managed'],
  },
  managed: {
    precedence: 30,
    trustedLocalCode: true,
    defaultEnableMode: 'default-on',
    canOverride: ['bundled', 'managed', 'plugin'],
    canBeOverriddenBy: ['managed'],
  },
  workspace: {
    precedence: 40,
    trustedLocalCode: true,
    defaultEnableMode: 'explicit-opt-in',
    canOverride: ['workspace'],
    canBeOverriddenBy: ['workspace'],
  },
};

/** 各来源优先级数值（导出供外部使用） */
export const HOOK_SOURCE_PRIORITIES: Record<HookSource, number> = {
  bundled: 10,
  plugin: 20,
  managed: 30,
  workspace: 40,
};

/** 获取指定来源的策略 */
function getHookSourcePolicy(source: HookSource): HookPolicy {
  return HOOK_SOURCE_POLICIES[source];
}

/** 判断某来源在默认情况下是否启用（不含配置覆盖） */
export function isHookEnabledByDefault(source: HookSource): boolean {
  return getHookSourcePolicy(source).defaultEnableMode === 'default-on';
}

/** 判断 candidate 是否可覆盖 existing（双方策略必须一致同意） */
export function canHookOverride(candidate: HookEntry, existing: HookEntry): boolean {
  const candidatePolicy = getHookSourcePolicy(candidate.hook.source);
  const existingPolicy = getHookSourcePolicy(existing.hook.source);
  return (
    candidatePolicy.canOverride.includes(existing.hook.source) &&
    existingPolicy.canBeOverriddenBy.includes(candidate.hook.source)
  );
}

/** 解析钩子的配置键名，优先取 metadata.hookKey，否则取 hook.name */
function resolveHookKey(entry: HookEntry): string {
  return entry.metadata?.hookKey ?? entry.hook.name;
}

/**
 * 从配置对象中按钩子键名解析单个钩子的配置块
 *
 * config 结构约定：config?.hooks?.internal?.entries?.[hookKey]
 */
export function resolveHookConfig(
  config: { hooks?: { internal?: { entries?: Record<string, HookConfig> } } } | undefined,
  hookKey: string,
): HookConfig | undefined {
  const entries = config?.hooks?.internal?.entries;
  if (!entries || typeof entries !== 'object') {
    return undefined;
  }
  const entry = entries[hookKey];
  if (!entry || typeof entry !== 'object') {
    return undefined;
  }
  return entry;
}

/**
 * 解析钩子在策略层面的启用状态（运行时要求检查之前）
 *
 * - plugin 源总是启用（不受 config.enabled 控制）
 * - 显式 enabled: false 则禁用
 * - explicit-opt-in 源（workspace）必须显式 enabled: true 才启用
 */
export function resolveHookEnableState(params: {
  entry: HookEntry;
  config?: Parameters<typeof resolveHookConfig>[0];
  hookConfig?: HookConfig;
}): HookEnableState {
  const { entry, config } = params;
  const hookKey = resolveHookKey(entry);
  const hookConfig = params.hookConfig ?? resolveHookConfig(config, hookKey);

  // plugin 钩子总是启用
  if (entry.hook.source === 'plugin') {
    return { enabled: true };
  }
  // 显式禁用
  if (hookConfig?.enabled === false) {
    return { enabled: false, reason: 'disabled in config' };
  }

  const sourcePolicy = getHookSourcePolicy(entry.hook.source);
  // workspace 等显式启用源：未显式 enabled: true 则默认禁用
  if (sourcePolicy.defaultEnableMode === 'explicit-opt-in' && hookConfig?.enabled !== true) {
    return { enabled: false, reason: 'workspace hook (disabled by default)' };
  }

  return { enabled: true };
}

type HookResolutionCollision = {
  name: string;
  kept: HookEntry;
  ignored: HookEntry;
};

/**
 * 按来源优先级 + 原始索引排序，合并同名钩子条目
 *
 * 高优先级（precedence 小）覆盖低优先级；但覆盖必须满足双向非对称规则。
 * 不满足覆盖规则时，保留先出现的高优先级条目，并通过 onCollisionIgnored 回调通知。
 */
export function resolveHookEntries(
  entries: HookEntry[],
  opts?: {
    onCollisionIgnored?: (collision: HookResolutionCollision) => void;
  },
): HookEntry[] {
  // 按优先级升序、再按原始索引升序排序（优先级小 = 高优先）
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const precedenceDelta =
        getHookSourcePolicy(a.entry.hook.source).precedence -
        getHookSourcePolicy(b.entry.hook.source).precedence;
      return precedenceDelta !== 0 ? precedenceDelta : a.index - b.index;
    });

  const merged = new Map<string, HookEntry>();
  for (const { entry } of ordered) {
    const existing = merged.get(entry.hook.name);
    if (!existing) {
      merged.set(entry.hook.name, entry);
      continue;
    }
    // 非对称覆盖：仅当双方策略均同意时，候选项才替换已存在项
    if (canHookOverride(entry, existing)) {
      merged.set(entry.hook.name, entry);
      continue;
    }
    opts?.onCollisionIgnored?.({
      name: entry.hook.name,
      kept: existing,
      ignored: entry,
    });
  }

  return Array.from(merged.values());
}
