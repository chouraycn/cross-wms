/** Compatibility helpers that auto-enable bundled plugins for legacy and Vitest flows. */
//
// 移植自 openclaw/src/plugins/bundled-compat.ts。
//
// 降级策略：
//  - 原文件依赖 ../config/types.openclaw.js 的 OpenClawConfig。cross-wms 尚未
//    移植完整配置类型层级。这里定义本地宽松结构占位。
//  - 原文件依赖 ../config/types.plugins.js 的 PluginEntryConfig。cross-wms 尚未
//    移植该模块。这里定义本地最小结构占位。
//  - 原文件依赖 ./config-policy.js 的 hasExplicitPluginConfig。cross-wms 尚未
//    移植该模块。这里内联降级实现：检查 config.plugins 是否有非空 entries/enabled。
//  - 原文件依赖 ./config-state.js 的 normalizePluginId。cross-wms 尚未移植
//    该模块。这里内联降级实现：仅 trim 输入字符串。
//  - 行为与 openclaw 原版一致：为旧版/Vitest 流自动启用 bundled 插件。

// ============================================================================
// 内联降级类型占位
// ============================================================================

/**
 * OpenClaw 配置的宽松类型占位。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的完整配置类型层级。
 * 这里定义结构化子集以满足 bundled-compat 对 plugins 字段的访问。
 */
type OpenClawConfig = {
  plugins?: {
    enabled?: boolean;
    allow?: string[];
    bundledDiscovery?: string;
    entries?: Record<string, PluginEntryConfig>;
    slots?: Record<string, unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * 插件条目配置（降级占位）。
 *
 * 降级原因：cross-wms 尚未移植 openclaw 的 ../config/types.plugins.js。
 * 这里定义与 openclaw PluginEntryConfig 结构兼容的最小类型。
 */
type PluginEntryConfig = {
  enabled?: boolean;
  [key: string]: unknown;
};

// ============================================================================
// 内联降级函数
// ============================================================================

/**
 * 检查是否有显式插件配置。
 *
 * 降级说明：cross-wms 的 config-policy.js 尚未移植。openclaw 原版检查
 * config.plugins 是否有显式 enabled/entries/slots 配置。这里降级为
 * 检查 config 是否有非空 entries 或显式 enabled 值。
 */
function hasExplicitPluginConfig(plugins: unknown): boolean {
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) {
    return false;
  }
  const config = plugins as { enabled?: unknown; entries?: unknown };
  if (typeof config.enabled === "boolean") {
    return true;
  }
  if (config.entries && typeof config.entries === "object" && !Array.isArray(config.entries)) {
    return Object.keys(config.entries).length > 0;
  }
  return false;
}

/**
 * 规范化插件 ID。
 *
 * 降级说明：cross-wms 的 config-state.js 尚未移植。这里降级为仅 trim 输入。
 */
function normalizePluginId(pluginId: string): string {
  return pluginId.trim();
}

// ============================================================================
// bundled-compat 实现
// ============================================================================

/** Returns config with selected bundled plugins explicitly enabled when compat rules require it. */
export function withBundledPluginEnablementCompat(params: {
  config: OpenClawConfig | undefined;
  pluginIds: readonly string[];
}): OpenClawConfig | undefined {
  const existingEntries = params.config?.plugins?.entries ?? {};
  const forcePluginsEnabled = params.config?.plugins?.enabled === false;
  const allow = params.config?.plugins?.allow;
  const bypassAllowlist = params.config?.plugins?.bundledDiscovery === "compat";
  const allowSet =
    !bypassAllowlist && Array.isArray(allow) && allow.length > 0
      ? new Set(allow.map((pluginId) => normalizePluginId(pluginId)).filter(Boolean))
      : undefined;
  let hasEligiblePlugin = false;
  let changed = false;
  const nextEntries: Record<string, PluginEntryConfig> = { ...existingEntries };
  const nextAllow = bypassAllowlist && Array.isArray(allow) ? new Set(allow) : undefined;

  for (const pluginId of params.pluginIds) {
    if (allowSet && !allowSet.has(pluginId)) {
      continue;
    }
    hasEligiblePlugin = true;
    const beforeAllowSize = nextAllow?.size;
    nextAllow?.add(pluginId);
    if (nextAllow && nextAllow.size !== beforeAllowSize) {
      changed = true;
    }
    if (existingEntries[pluginId] !== undefined) {
      continue;
    }
    nextEntries[pluginId] = { enabled: true };
    changed = true;
  }

  if (!changed) {
    if (!forcePluginsEnabled || !hasEligiblePlugin) {
      return params.config;
    }
  }

  return {
    ...params.config,
    plugins: {
      ...params.config?.plugins,
      ...(forcePluginsEnabled ? { enabled: true } : {}),
      ...(nextAllow ? { allow: [...nextAllow] } : {}),
      entries: {
        ...existingEntries,
        ...nextEntries,
      },
    },
  };
}

/** Enables bundled plugins in Vitest when tests did not provide explicit plugin config. */
export function withBundledPluginVitestCompat(params: {
  config: OpenClawConfig | undefined;
  pluginIds: readonly string[];
  env?: NodeJS.ProcessEnv;
}): OpenClawConfig | undefined {
  const env = params.env ?? process.env;
  const isVitest = Boolean(env.VITEST);
  if (
    !isVitest ||
    hasExplicitPluginConfig(params.config?.plugins) ||
    params.pluginIds.length === 0
  ) {
    return params.config;
  }

  const entries = Object.fromEntries(
    params.pluginIds.map((pluginId) => [pluginId, { enabled: true } satisfies PluginEntryConfig]),
  );

  return {
    ...params.config,
    plugins: {
      ...params.config?.plugins,
      enabled: true,
      allow: [...params.pluginIds],
      entries: {
        ...entries,
        ...params.config?.plugins?.entries,
      },
      slots: {
        ...params.config?.plugins?.slots,
        memory: "none",
      },
    },
  };
}
