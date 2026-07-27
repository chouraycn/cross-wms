// Base session-key helper keeps outbound-only delivery aligned with route
// resolution session-scope rules.
// 移植自 openclaw/src/infra/outbound/base-session-key.ts
// 降级策略：依赖 routing/resolve-route.ts 的 buildAgentSessionKey。
import type { OpenClawConfig } from "../../config/types.openclaw.js";
import { buildAgentSessionKey, type RoutePeer } from "../../routing/resolve-route.js";

/**
 * Builds the canonical outbound base-session key for a resolved route peer.
 */
export function buildOutboundBaseSessionKey(params: {
  cfg: OpenClawConfig;
  agentId: string;
  channel: string;
  accountId?: string | null;
  peer: RoutePeer;
}): string {
  const sessionCfg = (params.cfg as { session?: { dmScope?: string; identityLinks?: unknown } }).session;
  return buildAgentSessionKey({
    agentId: params.agentId,
    channel: params.channel,
    accountId: params.accountId,
    peer: params.peer,
    dmScope: (sessionCfg?.dmScope ?? "main") as
      | "main"
      | "per-peer"
      | "per-channel-peer"
      | "per-account-channel-peer"
      | undefined,
  });
}
