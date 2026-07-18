// 移植自 openclaw/src/cli/test-runtime-capture.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 生成方式：自动 stub（保留导出名以便后续替换为正式实现）

export function createCliRuntimeCapture(..._args: unknown[]): unknown {
  throw new Error("not implemented: createCliRuntimeCapture");
}

export async function mockRuntimeModule(..._args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: mockRuntimeModule");
}

export function spyRuntimeLogs(..._args: unknown[]): unknown {
  throw new Error("not implemented: spyRuntimeLogs");
}

export function spyRuntimeErrors(..._args: unknown[]): unknown {
  throw new Error("not implemented: spyRuntimeErrors");
}

export function spyRuntimeJson(..._args: unknown[]): unknown {
  throw new Error("not implemented: spyRuntimeJson");
}

export function firstWrittenJsonArg(..._args: unknown[]): unknown {
  throw new Error("not implemented: firstWrittenJsonArg");
}

export type CliMockOutputRuntime = unknown;
export type CliRuntimeCapture = unknown;
