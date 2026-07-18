/**
 * 状态系统 — 健康检查和状态文本生成
 */

export {
  type PluginHealthRecord,
  type PluginDiagnosticRecord,
  type RuntimeToolQuarantineRecord,
  type PluginCompatibilityHealthNotice,
  type ChannelPluginFailureRecord,
  type StatusPluginHealthSnapshot,
  mergeStatusPluginHealthSnapshots,
  dedupePluginDiagnostics,
  dedupeChannelPluginFailures,
  isChannelPluginFailureDiagnostic,
  formatCompactPluginHealthLine,
  formatDetailedPluginHealth,
  createEmptyPluginHealthSnapshot,
} from "./plugin-health.js";