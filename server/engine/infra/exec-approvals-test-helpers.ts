// 移植自 openclaw/src/infra/exec-approvals-test-helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function makePathEnv(...args: unknown[]): unknown {
  throw new Error("not implemented: makePathEnv");
}
export function makeTempDir(...args: unknown[]): unknown {
  throw new Error("not implemented: makeTempDir");
}
export function makeExecutable(...args: unknown[]): unknown {
  throw new Error("not implemented: makeExecutable");
}
export function makeMockExecutableResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: makeMockExecutableResolution");
}
export function makeMockCommandResolution(...args: unknown[]): unknown {
  throw new Error("not implemented: makeMockCommandResolution");
}
export function loadShellParserParityFixtureCases(...args: unknown[]): unknown {
  throw new Error("not implemented: loadShellParserParityFixtureCases");
}
export function loadWrapperResolutionParityFixtureCases(...args: unknown[]): unknown {
  throw new Error("not implemented: loadWrapperResolutionParityFixtureCases");
}
