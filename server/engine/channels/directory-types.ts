// 移植自 openclaw/src/channels/plugins/directory-types.ts

/**
 * Shared input for channel directory lookups.
 */
export type DirectoryConfigParams = {
  cfg: unknown;
  accountId?: string | null;
  query?: string | null;
  limit?: number | null;
};
