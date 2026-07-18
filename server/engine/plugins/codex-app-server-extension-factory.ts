/**
 * Builds Codex app-server extension factories from active plugin registries.
 * 移植自 openclaw/src/plugins/codex-app-server-extension-factory.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const CODEX_APP_SERVER_EXTENSION_RUNTIME_ID: unknown = undefined;

export function listCodexAppServerExtensionFactories(...args: unknown[]): unknown {
  throw new Error("not implemented: listCodexAppServerExtensionFactories");
}

