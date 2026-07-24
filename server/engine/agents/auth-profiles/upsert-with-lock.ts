/**
 * Locked auth profile upsert helper.
 *
 * 移植自 openclaw/src/agents/auth-profiles/upsert-with-lock.ts。
 * Normalizes literal secrets before persistence and routes all writes through
 * the shared store lock to avoid racing concurrent auth updates.
 */

import { normalizeAuthProfileCredential } from "../credential-normalize.js";
import {
  updateAuthProfileStoreWithLock,
  type AuthProfileCredential,
  type AuthProfileStore,
} from "../store.js";

/** Upserts an auth profile under the store lock, returning null on write failure. */
export async function upsertAuthProfileWithLock(params: {
  profileId: string;
  credential: AuthProfileCredential;
  agentDir?: string;
}): Promise<AuthProfileStore | null> {
  try {
    const credential = normalizeAuthProfileCredential(params.credential);
    return await updateAuthProfileStoreWithLock({
      agentDir: params.agentDir,
      saveOptions: {
        filterExternalAuthProfiles: false,
        syncExternalCli: false,
      },
      updater: (store) => {
        store.profiles[params.profileId] = credential;
        return true;
      },
    });
  } catch {
    return null;
  }
}
