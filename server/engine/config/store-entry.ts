// 移植自 openclaw/src/config/store-entry.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function normalizeStoreSessionKey(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeStoreSessionKey");
}
export function foldedSessionKeyAliasCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: foldedSessionKeyAliasCandidates");
}
export function isConfirmedLowercasedLegacyAlias(...args: unknown[]): unknown {
  throw new Error("not implemented: isConfirmedLowercasedLegacyAlias");
}
export function hasMismatchedCaseSensitiveDeliveryProof(...args: unknown[]): unknown {
  throw new Error("not implemented: hasMismatchedCaseSensitiveDeliveryProof");
}
export function resolveSessionStoreEntry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionStoreEntry");
}
