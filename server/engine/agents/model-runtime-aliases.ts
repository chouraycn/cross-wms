/**
 * Model runtime alias resolution.
 * Ported from openclaw/src/agents/model-runtime-aliases.ts
 * Simplified: runtime alias resolution replaced with identity defaults.
 */

export function isCliRuntimeProvider(_provider: any): boolean { return false; }
export function isCliRuntimeAlias(_modelRef: any): boolean { return false; }
export function isCliRuntimeAliasForProvider(_modelRef: any, _provider: any): boolean { return false; }
export function areRuntimeModelRefsEquivalent(a: any, b: any): boolean { return a === b; }
export function shouldPreferActiveRuntimeAliasAuthLabel(): boolean { return false; }
export function resolveCliRuntimeExecutionProvider(provider: any): any { return provider; }
