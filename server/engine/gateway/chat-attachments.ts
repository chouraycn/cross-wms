/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/chat-attachments.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ChatAttachment = unknown;

export type ChatImageContent = unknown;

export type OffloadedRef = unknown;

export function resolveChatAttachmentMaxBytes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveChatAttachmentMaxBytes not implemented");
}

export async function parseMessageWithAttachments(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] parseMessageWithAttachments not implemented");
}

export class UnsupportedAttachmentError {
  constructor(..._args: unknown[]) {
    throw new Error("[cross-wms gateway downgrade] UnsupportedAttachmentError not implemented");
  }
}

export class MediaOffloadError {
  constructor(..._args: unknown[]) {
    throw new Error("[cross-wms gateway downgrade] MediaOffloadError not implemented");
  }
}

export const DEFAULT_CHAT_ATTACHMENT_MAX_MB: any = undefined;
