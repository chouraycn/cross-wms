// UI 元数据附加到 config schema 路径，用于表单、文档与脱敏策略
/** 单个配置路径的 UI 提示 */
export type ConfigUiHint = {
  label?: string;
  help?: string;
  tags?: string[];
  group?: string;
  order?: number;
  advanced?: boolean;
  sensitive?: boolean;
  placeholder?: string;
  itemTemplate?: unknown;
};

/** 按点分 config 路径键的 UI 提示，`*` 匹配动态段 */
export type ConfigUiHints = Record<string, ConfigUiHint>;
