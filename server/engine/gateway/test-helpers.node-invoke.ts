// 移植自 openclaw/src/gateway/test-helpers.node-invoke.ts
// 注意：本文件为测试基础设施 stub，仅用于占位，不包含实际测试逻辑。

export function acknowledgeNodeInvokeRequestForTest(...args: unknown[]): unknown {
  return undefined;
}

export async function getConnectedNodeIdForTest(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}
