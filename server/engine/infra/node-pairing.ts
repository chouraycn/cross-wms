// 移植自 openclaw/src/infra/node-pairing.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type NodePairingRequestInput = unknown;
export type NodePairingPendingRequest = unknown;
export type NodePairingPendingSnapshot = unknown;
export type NodePairingCleanupClaim = unknown;
export type NodePairingSupersededRequest = unknown;
export type RequestNodePairingResult = unknown;
export type NodePairingPairedNode = unknown;
export function listNodePairing(...args: unknown[]): unknown {
  throw new Error("not implemented: listNodePairing");
}
export function beginNodePairingConnect(...args: unknown[]): unknown {
  throw new Error("not implemented: beginNodePairingConnect");
}
export function releaseNodePairingCleanupClaim(...args: unknown[]): unknown {
  throw new Error("not implemented: releaseNodePairingCleanupClaim");
}
export function finalizeNodePairingCleanupClaim(...args: unknown[]): unknown {
  throw new Error("not implemented: finalizeNodePairingCleanupClaim");
}
export function requestNodePairing(...args: unknown[]): unknown {
  throw new Error("not implemented: requestNodePairing");
}
export function reusePendingNodePairingForReconnect(...args: unknown[]): unknown {
  throw new Error("not implemented: reusePendingNodePairingForReconnect");
}
export function approveNodePairing(...args: unknown[]): unknown {
  throw new Error("not implemented: approveNodePairing");
}
export function rejectNodePairing(...args: unknown[]): unknown {
  throw new Error("not implemented: rejectNodePairing");
}
export function removePairedNode(...args: unknown[]): unknown {
  throw new Error("not implemented: removePairedNode");
}
export function verifyNodeToken(...args: unknown[]): unknown {
  throw new Error("not implemented: verifyNodeToken");
}
export function updatePairedNodeMetadata(...args: unknown[]): unknown {
  throw new Error("not implemented: updatePairedNodeMetadata");
}
export function renamePairedNode(...args: unknown[]): unknown {
  throw new Error("not implemented: renamePairedNode");
}
