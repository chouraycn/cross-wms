// Feishu plugin module implements permission management for cross-wms.
import type * as Lark from "@larksuiteoapi/node-sdk";
import { createFeishuClient } from "./client.js";
import type { FeishuConfig, ResolvedFeishuAccount } from "./types.js";

type ListTokenType = "doc" | "sheet" | "file" | "wiki" | "bitable" | "docx" | "mindnote" | "minutes" | "slides";
type CreateTokenType = "doc" | "sheet" | "file" | "wiki" | "bitable" | "docx" | "folder" | "mindnote" | "minutes" | "slides";
type MemberType = "email" | "openid" | "unionid" | "openchat" | "opendepartmentid" | "userid" | "groupid" | "wikispaceid";
type PermType = "view" | "edit" | "full_access";

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

async function listMembers(client: Lark.Client, token: string, type: string) {
  const res = await client.drive.permissionMember.list({ path: { token }, params: { type: type as ListTokenType } });
  if (res.code !== 0) throw new Error(res.msg);
  return { members: res.data?.items?.map((m) => ({ member_type: m.member_type, member_id: m.member_id, perm: m.perm, name: m.name })) ?? [] };
}

async function addMember(client: Lark.Client, token: string, type: string, memberType: string, memberId: string, perm: string) {
  const res = await client.drive.permissionMember.create({
    path: { token }, params: { type: type as CreateTokenType, need_notification: false },
    data: { member_type: memberType as MemberType, member_id: memberId, perm: perm as PermType },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { success: true, member: res.data?.member };
}

async function removeMember(client: Lark.Client, token: string, type: string, memberType: string, memberId: string) {
  const res = await client.drive.permissionMember.delete({
    path: { token, member_id: memberId }, params: { type: type as CreateTokenType, member_type: memberType as MemberType },
  });
  if (res.code !== 0) throw new Error(res.msg);
  return { success: true };
}

export function registerFeishuPermTools(api: any) {
  if (!api?.config) return;
  // Perm tools registration - will be wired to cross-wms tool framework
}
