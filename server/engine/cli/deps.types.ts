// Shared dependency surface for CLI send commands.
// 移植自 openclaw/src/cli/deps.types.ts。
//
// 降级说明：依赖 `./outbound-send-mapping.js` 的 `CliOutboundSendSource` 类型。
// 该模块在 cross-wms 中尚未移植；这里定义宽松的占位类型，保留 `CliDeps` 导出。

// ===== 内联降级：CliOutboundSendSource =====
/**
 * CLI outbound send source（降级占位）。
 *
 * 降级原因：openclaw 的 `outbound-send-mapping.js` 未移植。这里使用
 * `Record<string, unknown>` 作为宽松占位，保留 `CliDeps` 类型导出以便未来替换。
 */
export type CliOutboundSendSource = Record<string, unknown>;
// ===== CliOutboundSendSource 结束 =====

/** CLI dependency bag currently used by outbound send command plumbing. */
export type CliDeps = CliOutboundSendSource;
