// Root-help config probe for plugin-sensitive help rendering.
// 移植自 openclaw/src/cli/root-help-live-config.ts。
//
// 降级策略：
//  - 原模块依赖 `./program/root-help.js` 的 `RootHelpRenderOptions` 类型与
//    `../config/config.js` 的 `readConfigFileSnapshot`。
//    这些模块在 cross-wms 中尚未移植；这里定义宽松的
//    `RootHelpRenderOptions` 占位类型，`loadRootHelpRenderOptionsForConfigSensitivePlugins`
//    始终返回 null，保留函数签名以便未来替换。

// ===== 内联降级：RootHelpRenderOptions =====
/** Render options for root help (degraded placeholder). */
export type RootHelpRenderOptions = {
  config?: unknown;
  env?: NodeJS.ProcessEnv;
};
// ===== RootHelpRenderOptions 结束 =====

function hasEntries(value: object | undefined): boolean {
  return value !== undefined && Object.keys(value).length > 0;
}

function hasListEntries(value: string[] | undefined): boolean {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Load render options only when config/env can affect plugin help output.
 *
 * 降级实现：openclaw 的 `config/config.js`（`readConfigFileSnapshot`）未移植；
 * 这里始终返回 null，保留函数签名以便未来替换为正式实现。
 */
export async function loadRootHelpRenderOptionsForConfigSensitivePlugins(
  _env: NodeJS.ProcessEnv = process.env,
): Promise<RootHelpRenderOptions | null> {
  // openclaw 的 config/config.js 未移植；无法读取 config snapshot。
  return null;
}

// 保留 hasEntries/hasListEntries 引用以避免 unused 警告（降级路径下未使用）。
void hasEntries;
void hasListEntries;
