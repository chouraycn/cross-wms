import { createSessionManagerRuntimeRegistry } from "../agent-hooks/session-manager-runtime-registry.js";

type ToolSendReceiptResult = {
  details: {
    toolSend: any;
  };
};

const registry = createSessionManagerRuntimeRegistry<Map<string, ToolSendReceiptResult>>();

export function recordEmbeddedToolSendReceipt(
  sessionManager: any,
  toolCallId: string,
  toolSend: any,
): void {
  const receipts = registry.get(sessionManager) ?? new Map<string, ToolSendReceiptResult>();
  receipts.set(toolCallId, { details: { toolSend } });
  registry.set(sessionManager, receipts);
}

export function consumeEmbeddedToolSendReceipt(
  sessionManager: any,
  toolCallId: string,
): ToolSendReceiptResult | undefined {
  const receipts = registry.get(sessionManager);
  const receipt = receipts?.get(toolCallId);
  if (!receipts || !receipt) {
    return undefined;
  }
  receipts.delete(toolCallId);
  if (receipts.size === 0) {
    registry.set(sessionManager, null);
  }
  return receipt;
}
