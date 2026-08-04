/** Runtime-only dispatch dependencies shared by config-driven reply delivery. */
import { updateSessionEntry } from '@openclaw-src/config/sessions/session-accessor.js';
import type { SessionEntry } from '@openclaw-src/config/sessions/types.js';

export { resolveStorePath } from '@openclaw-src/config/sessions/paths.js';
export {
  loadSessionStore,
  readSessionEntry,
  resolveSessionStoreEntry,
} from '@openclaw-src/config/sessions/store.js';
export { createInternalHookEvent, triggerInternalHook } from '@openclaw-src/hooks/internal-hooks.js';

export async function updateSessionStoreEntry(params: {
  storePath: string;
  sessionKey: string;
  skipMaintenance?: boolean;
  takeCacheOwnership?: boolean;
  update: (
    entry: SessionEntry,
  ) => Promise<Partial<SessionEntry> | null> | Partial<SessionEntry> | null;
}): Promise<SessionEntry | null> {
  return await updateSessionEntry(
    {
      storePath: params.storePath,
      sessionKey: params.sessionKey,
    },
    params.update,
    {
      skipMaintenance: params.skipMaintenance,
      takeCacheOwnership: params.takeCacheOwnership,
    },
  );
}
