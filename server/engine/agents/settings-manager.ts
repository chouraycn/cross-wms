/**
 * 移植自 openclaw/src/agents/sessions/settings-manager.ts
 *
 * 降级策略：cross-wms 未完整移植 openclaw agents 子系统，
 * 本文件为降级 stub，仅保留导出签名，函数体抛出 "not implemented" 错误。
 * 类型降级为 unknown 占位，常量降级为 undefined。
 */

export type TransportSetting = unknown;
export type PackageSource = unknown;
export type SettingsScope = unknown;
export type CompactionSettings = unknown;
export type BranchSummarySettings = unknown;
export type ProviderRetrySettings = unknown;
export type RetrySettings = unknown;
export type TerminalSettings = unknown;
export type ImageSettings = unknown;
export type ThinkingBudgetsSettings = unknown;
export type MarkdownSettings = unknown;
export type WarningSettings = unknown;
export type Settings = unknown;
export type SettingsStorage = unknown;
export type SettingsError = unknown;
export class FileSettingsStorage {
  constructor(..._args: unknown[]) { throw new Error("FileSettingsStorage not implemented (openclaw stub)"); }
}
export class InMemorySettingsStorage {
  constructor(..._args: unknown[]) { throw new Error("InMemorySettingsStorage not implemented (openclaw stub)"); }
}
export class SettingsManager {
  constructor(..._args: unknown[]) { throw new Error("SettingsManager not implemented (openclaw stub)"); }
}
