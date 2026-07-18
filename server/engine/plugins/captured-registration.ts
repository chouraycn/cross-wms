/**
 * Captures plugin registrations for controlled registry assembly.
 * 移植自 openclaw/src/plugins/captured-registration.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type CapturedPluginRegistration = unknown;

export function createCapturedPluginRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: createCapturedPluginRegistration");
}

export function capturePluginRegistration(...args: unknown[]): unknown {
  throw new Error("not implemented: capturePluginRegistration");
}

