import type { ChannelId } from "../../channels/types.js";

export type SenderLabelType = "user" | "bot" | "system" | "admin" | "moderator" | "guest";

export interface SenderLabel {
  userId: string;
  channelId: ChannelId;
  displayName: string;
  type: SenderLabelType;
  color?: string;
  avatar?: string;
  tags: string[];
  isBot: boolean;
  isAdmin: boolean;
  isModerator: boolean;
}

const senderLabelCache = new Map<string, SenderLabel>();

export function getSenderLabelKey(channelId: ChannelId, userId: string): string {
  return `${channelId}:${userId}`;
}

export function createSenderLabel(params: {
  userId: string;
  channelId: ChannelId;
  displayName: string;
  type?: SenderLabelType;
  color?: string;
  avatar?: string;
  tags?: string[];
  isBot?: boolean;
  isAdmin?: boolean;
  isModerator?: boolean;
}): SenderLabel {
  const label: SenderLabel = {
    userId: params.userId,
    channelId: params.channelId,
    displayName: params.displayName,
    type: params.type ?? "user",
    color: params.color,
    avatar: params.avatar,
    tags: params.tags ?? [],
    isBot: params.isBot ?? false,
    isAdmin: params.isAdmin ?? false,
    isModerator: params.isModerator ?? false,
  };

  const key = getSenderLabelKey(params.channelId, params.userId);
  senderLabelCache.set(key, label);

  return label;
}

export function getSenderLabel(
  channelId: ChannelId,
  userId: string
): SenderLabel | undefined {
  const key = getSenderLabelKey(channelId, userId);
  return senderLabelCache.get(key);
}

export function getOrCreateSenderLabel(params: {
  userId: string;
  channelId: ChannelId;
  displayName?: string;
}): SenderLabel {
  const existing = getSenderLabel(params.channelId, params.userId);
  if (existing) return existing;

  return createSenderLabel({
    userId: params.userId,
    channelId: params.channelId,
    displayName: params.displayName ?? params.userId,
  });
}

export function updateSenderLabel(
  channelId: ChannelId,
  userId: string,
  updates: Partial<SenderLabel>
): boolean {
  const key = getSenderLabelKey(channelId, userId);
  const label = senderLabelCache.get(key);
  if (!label) return false;

  Object.assign(label, updates);
  return true;
}

export function addSenderTag(
  channelId: ChannelId,
  userId: string,
  tag: string
): boolean {
  const key = getSenderLabelKey(channelId, userId);
  const label = senderLabelCache.get(key);
  if (!label) return false;
  if (!label.tags.includes(tag)) {
    label.tags.push(tag);
  }
  return true;
}

export function removeSenderTag(
  channelId: ChannelId,
  userId: string,
  tag: string
): boolean {
  const key = getSenderLabelKey(channelId, userId);
  const label = senderLabelCache.get(key);
  if (!label) return false;
  const idx = label.tags.indexOf(tag);
  if (idx >= 0) {
    label.tags.splice(idx, 1);
    return true;
  }
  return false;
}

export function formatSenderName(label: SenderLabel, options?: {
  showType?: boolean;
  showTags?: boolean;
  maxLength?: number;
}): string {
  let name = label.displayName;

  if (options?.showType && label.type !== "user") {
    name = `[${label.type}] ${name}`;
  }

  if (options?.showTags && label.tags.length > 0) {
    name = `${name} (${label.tags.join(", ")})`;
  }

  if (options?.maxLength && name.length > options.maxLength) {
    name = name.slice(0, options.maxLength - 3) + "...";
  }

  return name;
}

export function isBotSender(channelId: ChannelId, userId: string): boolean {
  return getSenderLabel(channelId, userId)?.isBot ?? false;
}

export function isAdminSender(channelId: ChannelId, userId: string): boolean {
  return getSenderLabel(channelId, userId)?.isAdmin ?? false;
}

export function isModeratorSender(channelId: ChannelId, userId: string): boolean {
  return getSenderLabel(channelId, userId)?.isModerator ?? false;
}

export function listSenderLabels(channelId?: ChannelId): SenderLabel[] {
  let labels = Array.from(senderLabelCache.values());
  if (channelId) {
    labels = labels.filter((l) => l.channelId === channelId);
  }
  return labels;
}

export function clearSenderLabels(): void {
  senderLabelCache.clear();
}
