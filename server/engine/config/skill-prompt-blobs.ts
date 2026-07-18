// 移植自 openclaw/src/config/skill-prompt-blobs.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SessionSkillPromptBlobProjection = unknown;
export type SessionStorePersistenceProjection = unknown;
export function clearSessionSkillPromptRefCache(...args: unknown[]): unknown {
  throw new Error("not implemented: clearSessionSkillPromptRefCache");
}
export function getSessionSkillPromptRefCacheStatsForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: getSessionSkillPromptRefCacheStatsForTest");
}
export function getValidSessionSkillPromptBlobCacheStatsForTest(...args: unknown[]): unknown {
  throw new Error("not implemented: getValidSessionSkillPromptBlobCacheStatsForTest");
}
export function resolveSessionSkillPromptBlobPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveSessionSkillPromptBlobPath");
}
export function isSessionSkillPromptBlobReadable(...args: unknown[]): unknown {
  throw new Error("not implemented: isSessionSkillPromptBlobReadable");
}
export function projectSessionStoreForPersistence(...args: unknown[]): unknown {
  throw new Error("not implemented: projectSessionStoreForPersistence");
}
export function ensureSessionStorePromptBlobsForPersistence(...args: unknown[]): unknown {
  throw new Error("not implemented: ensureSessionStorePromptBlobsForPersistence");
}
export function hydrateSessionStoreSkillPromptRefs(...args: unknown[]): unknown {
  throw new Error("not implemented: hydrateSessionStoreSkillPromptRefs");
}
