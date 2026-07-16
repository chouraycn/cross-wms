// Feishu plugin module implements wiki/knowledge base behavior for cross-wms.
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

async function getWikiSpaceInfo(client: Lark.Client, spaceId: string) {
  const res = await client.wiki.space.get({ path: { space_id: spaceId } });
  if (res.code !== 0) throw new Error(res.msg);
  return res.data?.space;
}

async function listWikiSpaceNodes(client: Lark.Client, spaceId: string, pageSize?: number, pageToken?: string) {
  const res = await client.wiki.spaceNode.list({
    path: { space_id: spaceId },
    params: { page_size: pageSize ?? 50, page_token: pageToken },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { items: res.data?.items ?? [], has_more: res.data?.has_more, page_token: res.data?.page_token };
}

async function getWikiNodeInfo(client: Lark.Client, nodeId: string) {
  const res = await client.wiki.spaceNode.get({ path: { node_id: nodeId } });
  if (res.code !== 0) throw new Error(res.msg);
  return res.data?.node;
}

async function searchWikiSpace(client: Lark.Client, query: string, spaceId?: string, pageSize?: number, pageToken?: string) {
  const res = await client.wiki.spaceNode.list({
    path: { space_id: spaceId ?? "" },
    params: { page_size: pageSize ?? 20, page_token: pageToken },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { items: res.data?.items ?? [], has_more: res.data?.has_more, page_token: res.data?.page_token };
}

export function registerFeishuWikiTools(api: any) {
  if (!api?.config) return;
  // Wiki tools registration - will be wired to cross-wms tool framework
}
