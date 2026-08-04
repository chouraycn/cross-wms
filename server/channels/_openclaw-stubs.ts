/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

export function getChannelPlugin(_channelId?: string | null): unknown { return undefined; }
export function normalizeChannelId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return id;
}