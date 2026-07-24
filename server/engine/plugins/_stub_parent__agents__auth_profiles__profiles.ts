// === PARTIAL MIGRATION ===
// Source: openclaw/src/agents/auth-profiles/profiles.ts (待迁移)
// Used by: server/engine/plugins/provider-auth-helpers.ts
//
// upsertAuthProfileWithLock 已移植到 ../agents/auth-profiles/upsert-with-lock.js
// upsertAuthProfile 仍为占位 stub（依赖 profile-list.ts、setAuthProfileOrder 等
// 更深的依赖链，待后续迁移）

export { upsertAuthProfileWithLock } from "../agents/auth-profiles/upsert-with-lock.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const upsertAuthProfile: any = undefined as any;
