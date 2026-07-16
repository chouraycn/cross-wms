// Feishu plugin module implements typing indicator for cross-wms.
import { createFeishuClient } from "./client.js";
import type { ResolvedFeishuAccount } from "./types.js";

const TYPING_EMOJI = "Typing";
const FEISHU_BACKOFF_CODES = new Set([99991400, 99991403, 429]);

export class FeishuBackoffError extends Error {
  code: number;
  constructor(code: number) {
    super(`Feishu API backoff: code ${code}`);
    this.name = "FeishuBackoffError";
    this.code = code;
  }
}

export type TypingIndicatorState = {
  messageId: string;
  reactionId: string | null;
};

export function isFeishuBackoffError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const response = (err as { response?: { status?: number; data?: { code?: number } } }).response;
  if (response) {
    if (response.status === 429) return true;
    if (typeof response.data?.code === "number" && FEISHU_BACKOFF_CODES.has(response.data.code)) return true;
  }
  const code = (err as { code?: number }).code;
  if (typeof code === "number" && FEISHU_BACKOFF_CODES.has(code)) return true;
  return false;
}

export function getBackoffCodeFromResponse(response: unknown): number | undefined {
  if (typeof response !== "object" || response === null) return undefined;
  const code = (response as { code?: number }).code;
  if (typeof code === "number" && FEISHU_BACKOFF_CODES.has(code)) return code;
  return undefined;
}

function resolveFeishuRuntimeAccount(params: { cfg: any; accountId?: string }): ResolvedFeishuAccount & { configured: boolean } {
  const feishuCfg = params.cfg?.feishu ?? params.cfg;
  const appId = feishuCfg?.appId ?? feishuCfg?.app_id;
  const appSecret = feishuCfg?.appSecret ?? feishuCfg?.app_secret;
  return {
    accountId: params.accountId ?? "default", selectionSource: "explicit",
    enabled: !!(appId && appSecret), configured: !!(appId && appSecret),
    appId, appSecret, domain: feishuCfg?.domain ?? "feishu",
    encryptKey: feishuCfg?.encryptKey, verificationToken: feishuCfg?.verificationToken,
    config: feishuCfg ?? {},
  };
}

export async function addTypingIndicator(params: {
  cfg: any; messageId: string; accountId?: string; runtime?: any;
}): Promise<TypingIndicatorState> {
  const { cfg, messageId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) return { messageId, reactionId: null };
  const client = createFeishuClient(account);
  try {
    const response = await client.im.messageReaction.create({
      path: { message_id: messageId },
      data: { reaction_type: { emoji_type: TYPING_EMOJI } },
    });
    const backoffCode = getBackoffCodeFromResponse(response);
    if (backoffCode !== undefined) throw new FeishuBackoffError(backoffCode);
    const reactionId = (response as any)?.data?.reaction_id ?? null;
    return { messageId, reactionId };
  } catch (err) {
    if (isFeishuBackoffError(err)) throw err;
    return { messageId, reactionId: null };
  }
}

export async function removeTypingIndicator(params: {
  cfg: any; state: TypingIndicatorState; accountId?: string; runtime?: any;
}): Promise<void> {
  const { cfg, state, accountId } = params;
  if (!state.reactionId) return;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) return;
  const client = createFeishuClient(account);
  try {
    const result = await client.im.messageReaction.delete({
      path: { message_id: state.messageId, reaction_id: state.reactionId },
    });
    const backoffCode = getBackoffCodeFromResponse(result);
    if (backoffCode !== undefined) throw new FeishuBackoffError(backoffCode);
  } catch (err) {
    if (isFeishuBackoffError(err)) throw err;
  }
}
