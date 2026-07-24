// === MIGRATED FROM OPENCLAW SOURCE ===
// Source: openclaw/src/agents/auth-profiles/profiles.ts (upsertAuthProfile 函数)
// Status: 已移植 upsertAuthProfile 同步实现
// Used by: server/engine/plugins/provider-auth-helpers.ts
// 注：upsertAuthProfileWithLock 已移植到 ../agents/auth-profiles/upsert-with-lock.js。
//      upsertAuthProfile 现已移植完整实现，依赖 ../agents/credential-normalize.js
//      (normalizeAuthProfileCredential) 与 ../agents/store.js
//      (ensureAuthProfileStoreForLocalUpdate / saveAuthProfileStore)。
//      其余 openclaw 函数 (setAuthProfileOrder / promoteAuthProfileInOrder /
//      removeProviderAuthProfilesWithLock 等) 因依赖 profile-list.js 等更深的
//      依赖链，暂未移植。

import { normalizeAuthProfileCredential } from "../agents/credential-normalize.js";
import {
  ensureAuthProfileStoreForLocalUpdate,
  saveAuthProfileStore,
  type AuthProfileCredential,
} from "../agents/store.js";

export { upsertAuthProfileWithLock } from "../agents/auth-profiles/upsert-with-lock.js";

/** Upserts an auth profile immediately into the local store. */
export function upsertAuthProfile(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): void {
  const credential = normalizeAuthProfileCredential(params.credential);
  const store = ensureAuthProfileStoreForLocalUpdate(params.agentDir);
  store.profiles[params.profileId] = credential;
  saveAuthProfileStore(store, params.agentDir, {
    filterExternalAuthProfiles: false,
    syncExternalCli: false,
  });
}
