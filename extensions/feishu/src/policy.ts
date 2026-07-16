// Feishu plugin module implements policy behavior for cross-wms.
import { createFeishuClient } from "./client.js";
import type { FeishuConfig, FeishuChatType, ResolvedFeishuAccount } from "./types.js";

type FeishuDmPolicy = "open" | "pairing" | "allowlist" | "disabled";
type FeishuGroupPolicy = "open" | "allowlist" | "disabled" | "allowall";

function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  if (typeof value === "string") return value.toLowerCase() || undefined;
  return undefined;
}

const FEISHU_PROVIDER_PREFIX_RE = /^(feishu|lark):/i;
const FEISHU_TYPED_PREFIX_RE = /^(chat|group|channel|user|dm|open_id):/i;

function detectIdType(value: string): "chat_id" | "open_id" | "user_id" | "unknown" {
  if (/^oc_[a-f0-9]+$/i.test(value)) return "chat_id";
  if (/^ou_[a-f0-9]+$/i.test(value)) return "open_id";
  if (/^[a-f0-9]{16,}$/i.test(value)) return "unknown";
  return "unknown";
}

export function normalizeFeishuAllowEntry(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed === "*") return "*";
  let withoutProviderPrefix = trimmed;
  while (FEISHU_PROVIDER_PREFIX_RE.test(withoutProviderPrefix)) {
    withoutProviderPrefix = withoutProviderPrefix.replace(FEISHU_PROVIDER_PREFIX_RE, "").trim();
  }
  if (withoutProviderPrefix === "*") return "*";
  const lowered = normalizeOptionalLowercaseString(withoutProviderPrefix) ?? "";
  if (!lowered) return "";
  const prefixed = lowered.match(FEISHU_TYPED_PREFIX_RE);
  if (prefixed?.[1]) {
    const kind = ["chat", "group", "channel"].includes(prefixed[1]) ? "chat" : "user";
    const value = withoutProviderPrefix.slice(prefixed[0].length).trim();
    return value === "*" ? "*" : value ? `${kind}:${value}` : "";
  }
  const detectedType = detectIdType(withoutProviderPrefix);
  if (detectedType === "chat_id") return `chat:${withoutProviderPrefix}`;
  if (detectedType === "open_id" || detectedType === "user_id") return `user:${withoutProviderPrefix}`;
  return "";
}

function normalizeFeishuDmPolicy(policy: string | null | undefined): FeishuDmPolicy {
  return policy === "open" || policy === "pairing" || policy === "allowlist" || policy === "disabled" ? policy : "pairing";
}

function normalizeFeishuGroupPolicy(policy: FeishuGroupPolicy): Exclude<FeishuGroupPolicy, "allowall"> {
  return policy === "allowall" ? "open" : policy;
}

export async function resolveFeishuDmIngressAccess(params: {
  cfg: any; accountId?: string | null; dmPolicy?: string | null;
  allowFrom?: Array<string | number> | null; senderOpenId: string;
  senderUserId?: string | null; conversationId: string; mayPair: boolean;
}): Promise<{ ingress: { admission: string }; senderAccess: { decision: string }; commandAccess: { authorized: boolean } }> {
  const policy = normalizeFeishuDmPolicy(params.dmPolicy);
  const allowFrom = params.allowFrom ?? [];
  const normalizedSender = normalizeFeishuAllowEntry(params.senderOpenId);
  if (policy === "open") {
    return { ingress: { admission: "dispatch" }, senderAccess: { decision: "allow" }, commandAccess: { authorized: true } };
  }
  if (policy === "allowlist") {
    const allowed = allowFrom.some((entry) => normalizeFeishuAllowEntry(String(entry)) === normalizedSender);
    return { ingress: { admission: allowed ? "dispatch" : "denied" }, senderAccess: { decision: allowed ? "allow" : "deny" }, commandAccess: { authorized: allowed } };
  }
  if (policy === "pairing") {
    return { ingress: { admission: "pairing-required" }, senderAccess: { decision: "pending" }, commandAccess: { authorized: false } };
  }
  return { ingress: { admission: "denied" }, senderAccess: { decision: "deny" }, commandAccess: { authorized: false } };
}

export async function resolveFeishuGroupConversationIngressAccess(params: {
  cfg: any; accountId?: string | null; chatId: string;
  groupPolicy: FeishuGroupPolicy; groupAllowFrom?: Array<string | number> | null;
  groupExplicitlyConfigured?: boolean;
}): Promise<{ ingress: { admission: string } }> {
  const policy = normalizeFeishuGroupPolicy(params.groupPolicy);
  if (policy === "disabled") return { ingress: { admission: "denied" } };
  if (policy === "open") return { ingress: { admission: "dispatch" } };
  const allowFrom = params.groupAllowFrom ?? [];
  if (params.groupExplicitlyConfigured) allowFrom.push(params.chatId);
  const normalizedChatId = normalizeFeishuAllowEntry(params.chatId);
  const allowed = allowFrom.some((entry) => normalizeFeishuAllowEntry(String(entry)) === normalizedChatId);
  return { ingress: { admission: allowed ? "dispatch" : "denied" } };
}

export async function resolveFeishuGroupSenderActivationIngressAccess(params: {
  cfg: any; accountId?: string | null; chatId: string;
  allowFrom?: Array<string | number> | null; senderOpenId: string;
  senderUserId?: string | null; requireMention: boolean; mentionedBot: boolean;
}): Promise<{ senderAccess: { decision: string }; ingress: { admission: string }; commandAccess: { authorized: boolean } }> {
  const allowFrom = params.allowFrom ?? [];
  const normalizedSender = normalizeFeishuAllowEntry(params.senderOpenId);
  const senderAllowed = allowFrom.length === 0 || allowFrom.some((entry) => normalizeFeishuAllowEntry(String(entry)) === normalizedSender);
  const mentionOk = !params.requireMention || params.mentionedBot;
  if (!senderAllowed) return { senderAccess: { decision: "deny" }, ingress: { admission: "denied" }, commandAccess: { authorized: false } };
  if (!mentionOk) return { senderAccess: { decision: "allow" }, ingress: { admission: "no-mention" }, commandAccess: { authorized: false } };
  return { senderAccess: { decision: "allow" }, ingress: { admission: "dispatch" }, commandAccess: { authorized: true } };
}

export function resolveFeishuGroupConfig(params: { cfg?: FeishuConfig; groupId?: string | null }) {
  const groups = params.cfg?.groups ?? {};
  const wildcard = groups["*"];
  const groupId = params.groupId?.trim();
  if (!groupId) return undefined;
  const direct = groups[groupId];
  if (direct) return direct;
  const lowered = normalizeOptionalLowercaseString(groupId) ?? "";
  const matchKey = Object.keys(groups).find((key) => normalizeOptionalLowercaseString(key) === lowered);
  if (matchKey) return groups[matchKey];
  return wildcard;
}

export function hasExplicitFeishuGroupConfig(params: { cfg?: FeishuConfig; groupId?: string | null }): boolean {
  const groups = params.cfg?.groups ?? {};
  const groupId = params.groupId?.trim();
  if (!groupId) return false;
  if (Object.hasOwn(groups, groupId) && groupId !== "*") return true;
  const lowered = normalizeOptionalLowercaseString(groupId) ?? "";
  return Object.keys(groups).some((key) => key !== "*" && normalizeOptionalLowercaseString(key) === lowered);
}

export function resolveFeishuGroupToolPolicy(params: any): any { return undefined; }

export function resolveFeishuReplyPolicy(params: {
  isDirectMessage: boolean; cfg: any; accountId?: string | null;
  groupId?: string | null; groupPolicy?: string;
}): { requireMention: boolean } {
  if (params.isDirectMessage) return { requireMention: false };
  const feishuCfg = params.cfg?.channels?.feishu ?? params.cfg?.feishu ?? params.cfg;
  const groupConfig = resolveFeishuGroupConfig({ cfg: feishuCfg, groupId: params.groupId });
  const groupRequireMention = groupConfig?.requireMention;
  return {
    requireMention: typeof groupRequireMention === "boolean"
      ? groupRequireMention
      : typeof feishuCfg?.requireMention === "boolean"
        ? feishuCfg.requireMention
        : params.groupPolicy !== "open",
  };
}
