/**
 * 移植自 openclaw/src/agents/command/delivery.ts
 *
 * 降级实现：提供命令投递默认实现，不再抛出 stub 错误。
 */

export function normalizeAgentCommandReplyPayloads(payloads: any): any {
  return payloads;
}

export async function deliverAgentCommandResult(_params: any): Promise<void> {
  // no-op in cross-wms降级实现
}
