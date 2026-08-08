// Stub bridge for the openclaw `../infra/outbound/message.js` import path.
// Provides a simplified sendMessage placeholder for task delivery runtime seams.
export type MessageSendParams = {
  to: string;
  content: string;
  agentId?: string;
  requesterSessionKey?: string;
  requesterAccountId?: string;
  requesterSenderId?: string;
  channel?: string;
  cfg?: any;
  mediaUrl?: string;
  mediaUrls?: string[];
  payloads?: any[];
  buffer?: any;
  idempotencyKey?: string;
  dryRun?: boolean;
};

export type MessageSendResult = {
  channel: string;
  to: string;
  via: "direct" | "gateway";
  mediaUrl: string | null;
  mediaUrls?: string[];
  result?: { messageId: string };
  deliveryStatus?: "suppressed";
  dryRun?: boolean;
};

/** Simplified sendMessage stub; real implementation lives in the openclaw outbound gateway. */
export async function sendMessage(params: MessageSendParams): Promise<MessageSendResult> {
  return {
    channel: params.channel ?? "unknown",
    to: params.to,
    via: "direct",
    mediaUrl: params.mediaUrl ?? null,
    dryRun: params.dryRun,
  };
}
