/**
 * Resolves native module require paths for plugin runtime loading.
 * 移植自 openclaw/src/plugins/native-module-require.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function isJavaScriptModulePath(...args: unknown[]): unknown {
  throw new Error("not implemented: isJavaScriptModulePath");
}

export function tryNativeRequireJavaScriptModule(...args: unknown[]): unknown {
  throw new Error("not implemented: tryNativeRequireJavaScriptModule");
}

export function clearNativeRequireJavaScriptModuleCache(...args: unknown[]): unknown {
  throw new Error("not implemented: clearNativeRequireJavaScriptModuleCache");
}

export function withNativeRequireAliases(...args: unknown[]): unknown {
  throw new Error("not implemented: withNativeRequireAliases");
}

