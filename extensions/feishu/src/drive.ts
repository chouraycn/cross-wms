// Feishu plugin module implements drive/cloud doc behavior for cross-wms.
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient } from "./client.js";
import type { FeishuConfig, ResolvedFeishuAccount } from "./types.js";

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

export async function deliverCommentThreadText(params: {
  cfg: any; fileToken: string; fileType: string; commentId: string;
  text: string; accountId?: string;
}): Promise<{ success: boolean; replyId?: string }> {
  const { cfg, fileToken, fileType, commentId, text, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  try {
    const response = await client.drive.comment.createReply({
      path: { file_token: fileToken, comment_id: commentId },
      params: { file_type: fileType as any },
      data: { reply_type: "text", content: JSON.stringify({ text }) },
    });
    if (response.code !== 0) {
      return { success: false };
    }
    return { success: true, replyId: (response as any)?.data?.reply?.reply_id };
  } catch {
    return { success: false };
  }
}

export function registerFeishuDriveTools(api: any) {
  if (!api?.config) return;
  // Drive tools registration - will be wired to cross-wms tool framework
}
