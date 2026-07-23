export function getChannelPlugin(_channelId?: string | null): unknown { return undefined; }
export function normalizeChannelId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return id;
}