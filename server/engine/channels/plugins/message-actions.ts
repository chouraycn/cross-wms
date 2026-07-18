import { logger } from "../../../logger.js";
import type { ChannelId, AccountId } from "../../../channels/types.js";
import type { ChannelMessage } from "../message/types.js";

export type MessageActionType =
  | "reply"
  | "react"
  | "edit"
  | "delete"
  | "pin"
  | "unpin"
  | "bookmark"
  | "forward"
  | "quote"
  | "thread";

export interface MessageAction {
  type: MessageActionType;
  label?: string;
  emoji?: string;
  value?: string;
  metadata?: Record<string, unknown>;
}

export interface MessageActionContext {
  message: ChannelMessage;
  channelId: ChannelId;
  accountId?: AccountId;
  actions: MessageAction[];
}

type ActionHandler = (ctx: MessageActionContext) => Promise<boolean>;

const actionHandlers = new Map<MessageActionType, ActionHandler>();

export function registerMessageActionHandler(
  type: MessageActionType,
  handler: ActionHandler
): void {
  actionHandlers.set(type, handler);
  logger.debug(`[Plugins:MessageActions] Registered handler for ${type}`);
}

export function unregisterMessageActionHandler(type: MessageActionType): void {
  actionHandlers.delete(type);
}

export async function executeMessageAction(
  type: MessageActionType,
  ctx: MessageActionContext
): Promise<boolean> {
  const handler = actionHandlers.get(type);

  if (!handler) {
    logger.debug(`[Plugins:MessageActions] No handler for action ${type}`);
    return false;
  }

  try {
    return await handler(ctx);
  } catch (err) {
    logger.error(`[Plugins:MessageActions] Error executing ${type}`, { error: err });
    return false;
  }
}

export function createMessageAction(params: {
  type: MessageActionType;
  label?: string;
  emoji?: string;
  value?: string;
  metadata?: Record<string, unknown>;
}): MessageAction {
  return {
    type: params.type,
    label: params.label,
    emoji: params.emoji,
    value: params.value,
    metadata: params.metadata,
  };
}

export function addReactionAction(emoji: string, value?: string): MessageAction {
  return createMessageAction({
    type: "react",
    emoji,
    value,
    label: emoji,
  });
}

export function addReplyAction(label?: string): MessageAction {
  return createMessageAction({
    type: "reply",
    label: label ?? "Reply",
  });
}

export function addEditAction(label?: string): MessageAction {
  return createMessageAction({
    type: "edit",
    label: label ?? "Edit",
  });
}

export function addDeleteAction(label?: string): MessageAction {
  return createMessageAction({
    type: "delete",
    label: label ?? "Delete",
  });
}

export function addPinAction(label?: string): MessageAction {
  return createMessageAction({
    type: "pin",
    label: label ?? "Pin",
  });
}

export function addThreadAction(label?: string): MessageAction {
  return createMessageAction({
    type: "thread",
    label: label ?? "Thread",
  });
}

export function hasActionHandler(type: MessageActionType): boolean {
  return actionHandlers.has(type);
}

export function listAvailableActions(): MessageActionType[] {
  return Array.from(actionHandlers.keys());
}
