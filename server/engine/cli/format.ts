// Formatting and parse re-exports for node list/pairing CLI output.
// 移植自 openclaw/src/cli/nodes-cli/format.ts

import type { NodeListNode, PairedNode, PendingRequest } from "./types.js";

/** Format node permission maps as a stable `[permission=yes|no]` label. */
export function formatPermissions(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const entries = Object.entries(raw as Record<string, unknown>)
    .map(([key, value]) => [key ?? "", value === true] as const)
    .filter(([key]) => key.length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (entries.length === 0) {
    return null;
  }
  const parts = entries.map(([key, granted]) => `${key}=${granted ? "yes" : "no"}`);
  return `[${parts.join(", ")}]`;
}

/** Parse a node.list response into normalized NodeListNode objects. */
export function parseNodeList(result: unknown): NodeListNode[] {
  const obj = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  const nodes = Array.isArray(obj.nodes) ? obj.nodes : [];
  return nodes
    .filter((n): n is Record<string, unknown> => typeof n === "object" && n !== null)
    .map((n): NodeListNode => ({
      nodeId: String(n.nodeId ?? ""),
      displayName: typeof n.displayName === "string" ? n.displayName : undefined,
      platform: typeof n.platform === "string" ? n.platform : undefined,
      version: typeof n.version === "string" ? n.version : undefined,
      coreVersion: typeof n.coreVersion === "string" ? n.coreVersion : undefined,
      uiVersion: typeof n.uiVersion === "string" ? n.uiVersion : undefined,
      remoteIp: typeof n.remoteIp === "string" ? n.remoteIp : undefined,
      connected: Boolean(n.connected),
      paired: Boolean(n.paired),
      caps: Array.isArray(n.caps) ? n.caps.map(String) : undefined,
      permissions:
        typeof n.permissions === "object" && n.permissions !== null
          ? (n.permissions as Record<string, boolean>)
          : undefined,
      approvalState: typeof n.approvalState === "string" ? n.approvalState : undefined,
      pendingRequestId: typeof n.pendingRequestId === "string" ? n.pendingRequestId : undefined,
      pendingDeclaredCaps: Array.isArray(n.pendingDeclaredCaps)
        ? n.pendingDeclaredCaps.map(String)
        : undefined,
      pendingDeclaredCommands: Array.isArray(n.pendingDeclaredCommands)
        ? n.pendingDeclaredCommands.map(String)
        : undefined,
      pendingDeclaredPermissions:
        typeof n.pendingDeclaredPermissions === "object" && n.pendingDeclaredPermissions !== null
          ? (n.pendingDeclaredPermissions as Record<string, boolean>)
          : undefined,
      approvedAtMs: typeof n.approvedAtMs === "number" ? n.approvedAtMs : undefined,
      connectedAtMs: typeof n.connectedAtMs === "number" ? n.connectedAtMs : undefined,
      deviceFamily: typeof n.deviceFamily === "string" ? n.deviceFamily : undefined,
      modelIdentifier: typeof n.modelIdentifier === "string" ? n.modelIdentifier : undefined,
      clientId: typeof n.clientId === "string" ? n.clientId : undefined,
      clientMode: typeof n.clientMode === "string" ? n.clientMode : undefined,
      pathEnv: typeof n.pathEnv === "string" ? n.pathEnv : undefined,
      commands: Array.isArray(n.commands) ? n.commands.map(String) : undefined,
    }));
}

/** Parse a node.pair.list response into normalized pending/paired lists. */
export function parsePairingList(result: unknown): {
  pending: PendingRequest[];
  paired: PairedNode[];
} {
  const obj = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};
  const pending = Array.isArray(obj.pending) ? obj.pending : [];
  const paired = Array.isArray(obj.paired) ? obj.paired : [];
  return {
    pending: pending
      .filter((r): r is Record<string, unknown> => typeof r === "object" && r !== null)
      .map((r): PendingRequest => ({
        requestId: String(r.requestId ?? ""),
        nodeId: typeof r.nodeId === "string" ? r.nodeId : undefined,
        displayName: typeof r.displayName === "string" ? r.displayName : undefined,
        platform: typeof r.platform === "string" ? r.platform : undefined,
        version: typeof r.version === "string" ? r.version : undefined,
        remoteIp: typeof r.remoteIp === "string" ? r.remoteIp : undefined,
        requiredApproveScopes: Array.isArray(r.requiredApproveScopes)
          ? r.requiredApproveScopes.map(String)
          : undefined,
        commands: Array.isArray(r.commands) ? r.commands.map(String) : undefined,
        createdAtMs: typeof r.createdAtMs === "number" ? r.createdAtMs : undefined,
      })),
    paired: paired
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
      .map((p): PairedNode => ({
        nodeId: String(p.nodeId ?? ""),
        displayName: typeof p.displayName === "string" ? p.displayName : undefined,
        platform: typeof p.platform === "string" ? p.platform : undefined,
        version: typeof p.version === "string" ? p.version : undefined,
        remoteIp: typeof p.remoteIp === "string" ? p.remoteIp : undefined,
        token: typeof p.token === "string" ? p.token : undefined,
        createdAtMs: typeof p.createdAtMs === "number" ? p.createdAtMs : undefined,
        lastConnectedAtMs: typeof p.lastConnectedAtMs === "number" ? p.lastConnectedAtMs : undefined,
        permissions:
          typeof p.permissions === "object" && p.permissions !== null
            ? (p.permissions as Record<string, boolean>)
            : undefined,
        approvedAtMs: typeof p.approvedAtMs === "number" ? p.approvedAtMs : undefined,
      })),
  };
}
