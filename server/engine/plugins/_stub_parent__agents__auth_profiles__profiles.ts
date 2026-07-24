// === PARTIAL MIGRATION ===
// Source: openclaw/src/agents/auth-profiles/profiles.ts (待迁移)
// Used by: server/engine/plugins/provider-auth-helpers.ts
//
// upsertAuthProfileWithLock 已移植到 ../agents/auth-profiles/upsert-with-lock.js
// upsertAuthProfile 仍为占位 stub（依赖 profile-list.ts、setAuthProfileOrder 等
// 更深的依赖链，待后续迁移）；当前以抛出 "not implemented" 的 async 函数占位

export { upsertAuthProfileWithLock } from "../agents/auth-profiles/upsert-with-lock.js";
export const upsertAuthProfile = async (_params: unknown): Promise<never> => {
  throw new Error("upsertAuthProfile not implemented");
};
