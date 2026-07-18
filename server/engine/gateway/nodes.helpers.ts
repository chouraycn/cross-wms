// 移植自 openclaw/src/gateway/server-methods/nodes.helpers.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export const safeParseJson: unknown = undefined;

export function respondInvalidParams(...args: unknown[]): unknown {
  throw new Error("not implemented: respondInvalidParams");
}

export async function respondUnavailableOnThrow(...args: unknown[]): Promise<unknown> {
  throw new Error("not implemented: respondUnavailableOnThrow");
}

export function respondUnavailableOnNodeInvokeError(...args: unknown[]): unknown {
  throw new Error("not implemented: respondUnavailableOnNodeInvokeError");
}
