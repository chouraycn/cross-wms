// 移植自 openclaw/src/gateway/server-methods/nodes.helpers.ts

export const safeParseJson: (...args: unknown[]) => any = undefined as unknown as (...args: unknown[]) => any;

export function respondInvalidParams(...args: unknown[]): unknown {
  return undefined;
}

export async function respondUnavailableOnThrow(...args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function respondUnavailableOnNodeInvokeError(...args: unknown[]): unknown {
  return undefined;
}
