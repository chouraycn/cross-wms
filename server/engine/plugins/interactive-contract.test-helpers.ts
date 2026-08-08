/** Shared helpers for interactive plugin contract tests. */
type ConversationBindingHelpers = {
  requestConversationBinding: (...args: any[]) => unknown;
  detachConversationBinding: (...args: any[]) => unknown;
  getCurrentConversationBinding: (...args: any[]) => unknown;
};

type InteractiveHandlerRegistration<
  TChannel extends string,
  TContext,
> = ConversationBindingHelpers & {
  channel: TChannel;
  namespace: string;
  handler: (ctx: TContext) => unknown;
};

type BaseInteractiveContext<TChannel extends string> = ConversationBindingHelpers & {
  channel: TChannel;
  accountId: string;
  conversationId: string;
  parentConversationId?: string;
  senderId: string;
  senderUsername?: string;
  auth?: any;
};

export type TelegramInteractiveHandlerContext = BaseInteractiveContext<"telegram"> & {
  callbackId: string;
  senderUsername?: string;
  threadId?: number;
  isGroup?: boolean;
  isForum?: boolean;
  callback: {
    data: string;
    namespace: string;
    payload: string;
    messageId: number;
    chatId: string;
    messageText?: string;
  };
  respond: Record<string, (...args: any[]) => unknown>;
};

export type DiscordInteractiveHandlerContext = BaseInteractiveContext<"discord"> & {
  interactionId: string;
  guildId?: string;
  interaction: {
    data: string;
    namespace: string;
    payload: string;
    [key: string]: any;
  };
  respond: Record<string, (...args: any[]) => unknown>;
};

export type SlackInteractiveHandlerContext = BaseInteractiveContext<"slack"> & {
  interactionId: string;
  threadId?: string;
  interaction: {
    data: string;
    namespace: string;
    payload: string;
    [key: string]: any;
  };
  respond: Record<string, (...args: any[]) => unknown>;
};

export type TelegramInteractiveHandlerRegistration = InteractiveHandlerRegistration<
  "telegram",
  TelegramInteractiveHandlerContext
>;
export type DiscordInteractiveHandlerRegistration = InteractiveHandlerRegistration<
  "discord",
  DiscordInteractiveHandlerContext
>;
export type SlackInteractiveHandlerRegistration = InteractiveHandlerRegistration<
  "slack",
  SlackInteractiveHandlerContext
>;
