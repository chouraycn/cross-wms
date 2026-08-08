/**
 * Ported from openclaw/src/agents/auth-profiles/clone.ts
 *
 * Auth profile store cloning helpers.
 */

/** Deep-clones an auth profile store and rejects non-JSON values. */
export function cloneAuthProfileStore(store: Record<string, any>): Record<string, any> {
  return JSON.parse(
    JSON.stringify(store, (_key, value: any) => {
      if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
        throw new TypeError(`AuthProfileStore contains non-JSON value: ${typeof value}`);
      }
      return value;
    }),
  ) as Record<string, any>;
}
