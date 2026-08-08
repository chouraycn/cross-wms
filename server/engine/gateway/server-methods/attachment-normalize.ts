// Attachment normalization accepts permissive RPC attachment payloads and turns
// them into the bounded chat attachment shape used by gateway chat methods.
import type { ChatAttachment } from "../chat-attachments.js";

/** RPC attachment payload shape accepted by chat-like gateway methods. */
export type RpcAttachmentInput = {
  type?: any;
  mimeType?: any;
  fileName?: any;
  content?: any;
  source?: any;
};

function normalizeAttachmentContent(content: any): string | undefined {
  // RPC callers may send browser ArrayBuffers, typed-array slices, or base64
  // strings. Normalize all accepted forms to the chat attachment wire shape.
  if (typeof content === "string") {
    return content;
  }
  if (ArrayBuffer.isView(content)) {
    return Buffer.from(content.buffer, content.byteOffset, content.byteLength).toString("base64");
  }
  if (content instanceof ArrayBuffer) {
    return Buffer.from(content).toString("base64");
  }
  return undefined;
}

/** Convert permissive RPC attachment payloads into the bounded chat attachment shape. */
export function normalizeRpcAttachmentsToChatAttachments(
  attachments: RpcAttachmentInput[] | undefined,
): ChatAttachment[] {
  // Accept both the OpenClaw attachment fields and Anthropic-style
  // source:{type:"base64",media_type,data} payloads used by some clients.
  return (
    attachments
      ?.map((a) => {
        const source = a?.source && typeof a.source === "object" ? a.source : undefined;
        const sourceRecord = source as
          | { type?: any; media_type?: any; data?: any }
          | undefined;
        const sourceType = typeof sourceRecord?.type === "string" ? sourceRecord.type : undefined;
        const sourceMimeType =
          typeof sourceRecord?.media_type === "string" ? sourceRecord.media_type : undefined;
        const sourceContent =
          sourceType === "base64" ? normalizeAttachmentContent(sourceRecord?.data) : undefined;

        return {
          type: typeof a?.type === "string" ? a.type : undefined,
          mimeType: typeof a?.mimeType === "string" ? a.mimeType : sourceMimeType,
          fileName: typeof a?.fileName === "string" ? a.fileName : undefined,
          content: normalizeAttachmentContent(a?.content) ?? sourceContent,
        };
      })
      .filter((a) => a.content) ?? []
  );
}
