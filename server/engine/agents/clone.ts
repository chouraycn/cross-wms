/**
 * Ported from openclaw/src/agents/auth-profiles/clone.ts
 *
 * Auth profile store cloning helpers.
 */

/** Deep-clones an auth profile store and rejects non-JSON values. */
export function cloneAuthProfileStore(store: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(
    JSON.stringify(store, (_key, value: unknown) => {
      if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
        throw new TypeError(`AuthProfileStore contains non-JSON value: ${typeof value}`);
      }
      return value;
    }),
  ) as Record<string, unknown>;
}
