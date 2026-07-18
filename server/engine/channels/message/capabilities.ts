import { logger } from "../../../logger.js";
import type { ChannelId } from "../../../channels/types.js";
import type { MessageCapabilities } from "./types.js";

const capabilityStore = new Map<ChannelId, MessageCapabilities>();

const defaultCapabilities: Required<MessageCapabilities> = {
  text: true,
  markdown: false,
  attachments: false,
  reactions: false,
  threading: false,
  replies: false,
  mentions: false,
  typing: false,
  editing: false,
  deletion: false,
  readReceipts: false,
  deliveryReceipts: false,
};

export function setChannelCapabilities(channelId: ChannelId, caps: MessageCapabilities): void {
  capabilityStore.set(channelId, { ...defaultCapabilities, ...caps });
  logger.debug(`[Message:Capabilities] Set capabilities for ${channelId}`);
}

export function getChannelCapabilities(channelId: ChannelId): MessageCapabilities {
  return capabilityStore.get(channelId) ?? { ...defaultCapabilities };
}

export function hasCapability(channelId: ChannelId, capability: keyof MessageCapabilities): boolean {
  const caps = getChannelCapabilities(channelId);
  return caps[capability] === true;
}

export function mergeCapabilities(
  base: MessageCapabilities,
  override: MessageCapabilities
): MessageCapabilities {
  return { ...base, ...override };
}

export function disableCapabilities(
  caps: MessageCapabilities,
  ...toDisable: (keyof MessageCapabilities)[]
): MessageCapabilities {
  const result = { ...caps };
  for (const cap of toDisable) {
    result[cap] = false;
  }
  return result;
}

export function enableCapabilities(
  caps: MessageCapabilities,
  ...toEnable: (keyof MessageCapabilities)[]
): MessageCapabilities {
  const result = { ...caps };
  for (const cap of toEnable) {
    result[cap] = true;
  }
  return result;
}

export function getSupportedFeatures(channelId: ChannelId): string[] {
  const caps = getChannelCapabilities(channelId);
  const supported: string[] = [];

  for (const [key, value] of Object.entries(caps)) {
    if (value === true) {
      supported.push(key);
    }
  }

  return supported;
}

export function removeChannelCapabilities(channelId: ChannelId): boolean {
  return capabilityStore.delete(channelId);
}

export function clearAllCapabilities(): void {
  capabilityStore.clear();
}
