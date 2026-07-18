/**
 * * Reads legacy npm plugin declaration files left by early plugin installs.
 * 移植自 openclaw/src/plugins/legacy-npm-declaration.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export const LEGACY_NPM_DECLARATION_FILE: unknown = undefined;

export type LegacyNpmPluginDeclaration = unknown;

export function readLegacyNpmPluginDeclaration(...args: unknown[]): unknown {
  throw new Error("not implemented: readLegacyNpmPluginDeclaration");
}

