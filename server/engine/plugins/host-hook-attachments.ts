/**
 * Plugin session attachment delivery.
 *
 * 移植自 openclaw/src/plugins/host-hook-attachments.ts。
 * 降级策略：运行时函数降级为返回默认值或抛出 "not implemented"。
 */

export const attachmentProbeFs = {
  existsSync(_path: string): boolean {
    return false;
  },
  statSync(_path: string): { mtimeMs: number; size: number } | undefined {
    return undefined;
  },
};

export function resolveAttachmentDelivery(params: {
  attachment: { file?: unknown; url?: string; content?: unknown };
  workspaceDir?: string;
}): { kind: "file" | "url" | "inline" | "none"; path?: string; url?: string } {
  void params;
  return { kind: "none" };
}

export function resolveSessionAttachmentThreadId(params: {
  sessionId: string;
  attachmentId?: string;
}): string {
  void params;
  throw new Error("not implemented: resolveSessionAttachmentThreadId");
}

export async function sendPluginSessionAttachment(params: {
  sessionId: string;
  attachment: unknown;
  workspaceDir?: string;
}): Promise<void> {
  void params;
  throw new Error("not implemented: sendPluginSessionAttachment");
}
