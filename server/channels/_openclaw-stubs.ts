export function getChannelPlugin(_channelId?: string | null): any { return undefined; }
export function normalizeChannelId(id: string | null | undefined): string | undefined {
  if (!id) return undefined;
  return id;
}