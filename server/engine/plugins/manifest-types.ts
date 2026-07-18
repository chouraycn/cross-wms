/** 插件配置 schema 字段的 UI 提示元数据。 */
export type PluginConfigUiHint = {
  label?: string;
  help?: string;
  tags?: string[];
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
};

/** 顶层插件 manifest 格式。 */
export type PluginFormat = "openclaw" | "bundle";

/** 支持的外部 bundle manifest 格式。 */
export type PluginBundleFormat = "codex" | "claude" | "cursor";

/**
 * 插件诊断的封闭分类码。健康面会基于这些码分支，
 * 而不是匹配自由文本的诊断消息。
 */
export type PluginDiagnosticCode = "channel-setup-failure";

/** 发现或校验插件时发出的诊断信息。 */
export type PluginDiagnostic = {
  level: "warn" | "error";
  message: string;
  pluginId?: string;
  source?: string;
  code?: PluginDiagnosticCode;
};
