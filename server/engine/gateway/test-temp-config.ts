// 移植自 openclaw/src/gateway/test-temp-config.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export async function withTempConfig(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: withTempConfig");
}
