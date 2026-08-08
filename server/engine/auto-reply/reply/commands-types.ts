// @ts-nocheck
/** Shared command handler context and result contracts.
 *
 * 移植自 openclaw/src/auto-reply/reply/commands-types.ts
 *
 * 降级说明：
 *  - 原文件依赖 openclaw 的 agents/embedded-agent-block-chunker, channels/plugins,
 *    config/sessions, config/types.openclaw, skills/types, templating, thinking,
 *    directive-handling.parse, typing 等模块，cross-wms 暂未完整移植。
 *  - 这里保留核心 HandleCommandsParams / CommandHandlerResult / CommandHandler 契约，
 *    将依赖类型降级为最小占位，结构兼容 openclaw 原始定义。
 *  - OpenClawConfig 复用 ./queue/types.js 中导出的 OpenClawConfigStub。
 */
import type { OpenClawConfigStub } from "./queue/types.js";
import type { ReplyPayload } from "../types.js";

/** Normalized command metadata derived from an inbound message. */
export type CommandContext = {
  surface: string;
  channel: string;
  channelId?: string;
  accountId?: string;
  ownerList: string[];
  senderIsOwner: boolean;
  isAuthorizedSender: boolean;
  senderId?: string;
  abortKey?: string;
  rawBodyNormalized: string;
  commandBodyNormalized: string;
  from?: string;
  to?: string;
  resetHookTriggered?: boolean;
  softResetTriggered?: boolean;
  softResetTail?: string;
};

/** Minimal MsgContext 占位类型（与 openclaw MsgContext 结构兼容子集）。 */
export type MsgContext = Record<string, any> & {
  ChatType?: string;
  MessageSidFull?: string;
  MessageSid?: string;
  MessageSidFirst?: string;
  MessageSidLast?: string;
  CommandTargetSessionKey?: string;
};

/** Full input object passed to each command handler. */
export type HandleCommandsParams = {
  ctx: MsgContext;
  rootCtx?: MsgContext;
  cfg: OpenClawConfigStub;
  command: CommandContext;
  agentId?: string;
  agentDir?: string;
  directives: Record<string, any>;
  elevated: {
    enabled: boolean;
    allowed: boolean;
    failures: Array<{ gate: string; key: string }>;
  };
  sessionEntry?: Record<string, any>;
  previousSessionEntry?: Record<string, any>;
  sessionStore?: Record<string, Record<string, any>>;
  sessionKey: string;
  storePath?: string;
  workspaceDir: string;
  isGroup: boolean;
  provider: string;
  model: string;
  contextTokens: number;
};

/** Result returned by a command handler. */
export type CommandHandlerResult = {
  reply?: ReplyPayload;
  shouldContinue: boolean;
};

/** Command handler function shape. */
export type CommandHandler = (
  params: HandleCommandsParams,
  allowTextCommands: boolean,
) => Promise<CommandHandlerResult | null>;
