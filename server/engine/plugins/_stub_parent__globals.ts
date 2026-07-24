// === MIGRATED FROM OPENCLAW SOURCE (simplified) ===
// Source: openclaw/src/globals.ts (logVerbose 函数)
// Status: 已移植 openclaw 同源实现（简化版）
// Used by: server/engine/plugins/{commands,command-registration}.ts
// 注：openclaw logVerbose 根据 verbose 标志输出到 logger/theme console。
//      由于 cross-wms logger/theme 体系与 openclaw 不同，这里仅保留
//      verbose 标志位 + console.log 占位实现，避免引入完整 logger 依赖。

const VERBOSE_ENV = ["CROSS_WMS_VERBOSE", "OPENCLAW_VERBOSE", "VERBOSE"];

function isVerbose(): boolean {
  for (const key of VERBOSE_ENV) {
    const value = process.env[key];
    if (value === "1" || value === "true" || value === "yes") {
      return true;
    }
  }
  return false;
}

/**
 * Conditionally log a verbose message to the console based on the
 * CROSS_WMS_VERBOSE / OPENCLAW_VERBOSE / VERBOSE environment flags.
 * Reference: openclaw/src/globals.ts (logVerbose)
 */
export function logVerbose(message: string): void {
  if (!isVerbose()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(message);
}
