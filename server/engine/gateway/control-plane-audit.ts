// Gateway control-plane audit helpers.
// Extracts stable actor identity and compact changed-path summaries for audit logs.
// 移植自 openclaw/src/gateway/control-plane-audit.ts。
// 降级：GatewayClient 类型来自 ./server-methods/types.js（未移植），内联宽松类型占位。

import { normalizeControlPlaneIdentityPart } from "./control-plane-identity.js";

/** Gateway 客户端宽松类型占位（仅保留 control-plane audit 所需字段）。 */
type GatewayClientLike = {
  connId?: string;
  clientIp?: string;
  connect?: {
    client?: { id?: string };
    device?: { id?: string };
  };
} | null;

/** Stable actor fields included in control-plane audit and rate-limit logs. */
export type ControlPlaneActor = {
  actor: string;
  deviceId: string;
  clientIp: string;
  connId: string;
};

/** Extracts audit identity from a possibly missing or partially connected client. */
export function resolveControlPlaneActor(client: GatewayClientLike): ControlPlaneActor {
  return {
    actor: normalizeControlPlaneIdentityPart(client?.connect?.client?.id, "unknown-actor"),
    deviceId: normalizeControlPlaneIdentityPart(client?.connect?.device?.id, "unknown-device"),
    clientIp: normalizeControlPlaneIdentityPart(client?.clientIp, "unknown-ip"),
    connId: normalizeControlPlaneIdentityPart(client?.connId, "unknown-conn"),
  };
}

/** Formats actor identity as compact key/value text for structured gateway logs. */
export function formatControlPlaneActor(actor: ControlPlaneActor): string {
  return `actor=${actor.actor} device=${actor.deviceId} ip=${actor.clientIp} conn=${actor.connId}`;
}

/** Summarizes changed config/state paths without letting audit logs grow unbounded. */
export function summarizeChangedPaths(paths: string[], maxPaths = 8): string {
  if (paths.length === 0) {
    return "<none>";
  }
  if (paths.length <= maxPaths) {
    return paths.join(",");
  }
  const head = paths.slice(0, maxPaths).join(",");
  return `${head},+${paths.length - maxPaths} more`;
}
