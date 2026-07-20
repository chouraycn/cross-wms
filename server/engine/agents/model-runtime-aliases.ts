/**
 * Model runtime alias resolution.
 * Ported from openclaw/src/agents/model-runtime-aliases.ts
 * Simplified: runtime alias resolution replaced with identity defaults.
 */

export function isCliRuntimeProvider(_provider: unknown): boolean { return false; }
export function isCliRuntimeAlias(_modelRef: unknown): boolean { return false; }
export function isCliRuntimeAliasForProvider(_modelRef: unknown, _provider: unknown): boolean { return false; }
export function areRuntimeModelRefsEquivalent(a: unknown, b: unknown): boolean { return a === b; }
export function shouldPreferActiveRuntimeAliasAuthLabel(): boolean { return false; }
export function resolveCliRuntimeExecutionProvider(provider: unknown): unknown { return provider; }
