// 移植自 openclaw/src/gateway/server-methods/nodes.helpers.ts

export const safeParseJson: (...args: any[]) => unknown = undefined as unknown as (...args: any[]) => unknown;

export function respondInvalidParams(...args: any[]): any {
  return undefined;
}

export async function respondUnavailableOnThrow(...args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function respondUnavailableOnNodeInvokeError(...args: any[]): any {
  return undefined;
}
