/**
 * Registers plugin-provided CLI command groups.
 * 移植自 openclaw/src/plugins/register-plugin-cli-command-groups.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginCliCommandGroupEntry = unknown;

export type PluginCliCommandGroupMode = unknown;


