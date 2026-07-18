/**
 * * Parses, clones, verifies, and installs plugin packages from Git specs.
 * 移植自 openclaw/src/plugins/git-install.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export type GitPluginResolution = unknown;

export type GitPluginInstallResult = unknown;

export type ParsedGitPluginSpec = unknown;

export function isImmutableGitCommitRef(...args: unknown[]): unknown {
  throw new Error("not implemented: isImmutableGitCommitRef");
}

export function parseGitPluginSpec(...args: unknown[]): unknown {
  throw new Error("not implemented: parseGitPluginSpec");
}


