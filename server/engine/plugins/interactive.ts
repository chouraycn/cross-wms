/**
 * Resolves interactive plugin entries from registry metadata.
 * 移植自 openclaw/src/plugins/interactive.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type PluginInteractiveMatch = unknown;


// Re-export: export type { InteractiveRegistrationResult } from "./interactive-registry.js";


