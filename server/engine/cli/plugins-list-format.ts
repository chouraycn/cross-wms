// 插件列表行与详细信息的文本格式化器。
// 移植自 openclaw/src/cli/plugins-list-format.ts。
//
// 降级策略：
//  - 原模块依赖 `../../packages/terminal-core/src/safe-text.js` 的
//    `sanitizeTerminalText`。cross-wms 未移植 terminal-core 包；
//    这里内联一个 stub，直接返回输入字符串，不做 ANSI 转义处理。
//  - 原模块依赖 `../../packages/terminal-core/src/theme.js` 的 `theme`。
//    cross-wms 未移植 terminal-core 包；这里内联一个 theme stub，
//    直接返回输入字符串，不应用 ANSI 颜色。
//  - 原模块依赖 `../plugins/registry.js` 的 `PluginRecord`。
//    cross-wms 的 `plugins/registry.js` 使用了不同的 `RegistryEntry` 结构。
//    这里内联结构兼容的类型占位，包含 list-format 实际访问的字段。
//  - 原模块依赖 `../utils.js` 的 `shortenHomeInString`。
//    cross-wms 未移植该函数；这里内联一个简化实现（替换 $HOME 为 ~）。

// ===== 内联 theme stub（替代未移植的 terminal-core/theme.js）=====
const theme = {
  error(value: string): string {
    return value;
  },
  success(value: string): string {
    return value;
  },
  warn(value: string): string {
    return value;
  },
  muted(value: string): string {
    return value;
  },
  command(value: string): string {
    return value;
  },
};
// ===== theme stub 结束 =====

// ===== 内联 sanitizeTerminalText stub（替代未移植的 terminal-core/safe-text.js）=====
/**
 * 终端文本清理 stub。
 *
 * 降级说明：原模块使用 terminal-core 的 sanitizeTerminalText 移除控制字符
 * 与不安全的 ANSI 序列。这里直接返回输入字符串，不做处理。
 * 未来 cross-wms 移植 terminal-core 后可替换为正式实现。
 */
function sanitizeTerminalText(value: string): string {
  return value;
}
// ===== sanitizeTerminalText stub 结束 =====

// ===== 内联 shortenHomeInString（替代未移植的 ../utils.js#shortenHomeInString）=====
/**
 * 将字符串中的 home 目录前缀替换为 `~`。
 *
 * 降级说明：原模块依赖 openclaw `utils.js` 的 `shortenHomeInString`。
 * cross-wms 未移植该函数；这里内联一个简化实现，行为与 openclaw 一致。
 */
function shortenHomeInString(value: string): string {
  if (typeof value !== "string" || value.length === 0) {
    return value;
  }
  const home = process.env.HOME ?? process.env.USERPROFILE;
  if (!home || home.length === 0) {
    return value;
  }
  if (value === home) {
    return "~";
  }
  if (value.startsWith(home + "/") || value.startsWith(home + "\\")) {
    return "~" + value.slice(home.length);
  }
  return value;
}
// ===== shortenHomeInString 结束 =====

// ============================================================================
// 内联降级：../plugins/registry.js —— PluginRecord 类型占位
// ============================================================================

/**
 * 插件注册表记录（降级类型占位）。
 *
 * 降级原因：cross-wms 的 `plugins/registry.js` 使用了不同的 `RegistryEntry` 结构，
 * 没有 `PluginRecord` 类型。这里定义与 openclaw 结构兼容的类型，仅包含本模块
 * 实际访问的字段。
 */
type PluginRecord = {
  id: string;
  name?: string;
  description?: string;
  enabled: boolean;
  status?: string;
  format?: string;
  bundleFormat?: string;
  version?: string;
  source: string;
  origin: string;
  activated?: boolean;
  imported?: boolean;
  explicitlyEnabled?: boolean;
  activationSource?: string;
  activationReason?: string;
  providerIds: readonly string[];
  error?: string;
};

// ============================================================================
// list-format 实现
// ============================================================================

/** Format a plugin row for compact display, optionally with verbose details. */
export function formatPluginLine(plugin: PluginRecord, verbose = false): string {
  const status =
    plugin.status === "error"
      ? theme.error("error")
      : plugin.enabled
        ? theme.success("enabled")
        : theme.warn("disabled");
  const name = theme.command(plugin.name || plugin.id);
  const idSuffix = plugin.name && plugin.name !== plugin.id ? theme.muted(` (${plugin.id})`) : "";
  const desc = plugin.description
    ? theme.muted(
        plugin.description.length > 60
          ? `${plugin.description.slice(0, 57)}...`
          : plugin.description,
      )
    : theme.muted("(no description)");
  const format = plugin.format ?? "openclaw";

  if (!verbose) {
    return `${name}${idSuffix} ${status} ${theme.muted(`[${format}]`)} - ${desc}`;
  }

  const parts = [
    `${name}${idSuffix} ${status}`,
    `  format: ${format}`,
    `  source: ${theme.muted(shortenHomeInString(plugin.source))}`,
    `  origin: ${plugin.origin}`,
  ];
  if (plugin.bundleFormat) {
    parts.push(`  bundle format: ${plugin.bundleFormat}`);
  }
  if (plugin.version) {
    parts.push(`  version: ${plugin.version}`);
  }
  if (plugin.activated !== undefined) {
    parts.push(`  activated: ${plugin.activated ? "yes" : "no"}`);
  }
  if (plugin.imported !== undefined) {
    parts.push(`  imported: ${plugin.imported ? "yes" : "no"}`);
  }
  if (plugin.explicitlyEnabled !== undefined) {
    parts.push(`  explicitly enabled: ${plugin.explicitlyEnabled ? "yes" : "no"}`);
  }
  if (plugin.activationSource) {
    parts.push(`  activation source: ${plugin.activationSource}`);
  }
  if (plugin.activationReason) {
    parts.push(`  activation reason: ${sanitizeTerminalText(plugin.activationReason)}`);
  }
  if (plugin.providerIds.length > 0) {
    parts.push(`  providers: ${plugin.providerIds.join(", ")}`);
  }
  if (plugin.activated !== undefined || plugin.activationSource || plugin.activationReason) {
    const activationSummary =
      plugin.activated === false
        ? "inactive"
        : (plugin.activationSource ?? (plugin.activated ? "active" : "inactive"));
    parts.push(`  activation: ${activationSummary}`);
  }
  if (plugin.error) {
    parts.push(theme.error(`  error: ${plugin.error}`));
  }
  return parts.join("\n");
}
