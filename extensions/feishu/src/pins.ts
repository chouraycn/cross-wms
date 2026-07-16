// Feishu plugin module implements pins behavior for cross-wms.
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

export async function createPinFeishu(params: {
  cfg: any; messageId: string; accountId?: string;
}): Promise<{ pinned: boolean; pinId?: string }> {
  const { cfg, messageId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  try {
    const response = await client.im.pin.create({
      data: { message_id: messageId },
    });
    if (response.code !== 0) {
      return { pinned: false };
    }
    return { pinned: true, pinId: (response as any)?.data?.pin_id };
  } catch {
    return { pinned: false };
  }
}

export async function removePinFeishu(params: {
  cfg: any; pinId: string; accountId?: string;
}): Promise<{ removed: boolean }> {
  const { cfg, pinId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  try {
    const response = await client.im.pin.delete({
      path: { pin_id: pinId },
    });
    return { removed: response.code === 0 };
  } catch {
    return { removed: false };
  }
}

export async function listPinsFeishu(params: {
  cfg: any; chatId: string; accountId?: string;
}): Promise<{ pins: Array<{ pinId: string; messageId: string; createTime?: number }> }> {
  const { cfg, chatId, accountId } = params;
  const account = resolveFeishuRuntimeAccount({ cfg, accountId });
  if (!account.configured) throw new Error(`Feishu account "${account.accountId}" not configured`);
  const client = createFeishuClient(account);
  try {
    const response = await client.im.pin.list({
      params: { chat_id: chatId },
    });
    if (response.code !== 0) {
      return { pins: [] };
    }
    const items = (response as any)?.data?.items ?? [];
    return {
      pins: items.map((item: any) => ({
        pinId: item.pin_id ?? "",
        messageId: item.message_id ?? "",
        createTime: item.create_time ? Number(item.create_time) : undefined,
      })),
    };
  } catch {
    return { pins: [] };
  }
}
