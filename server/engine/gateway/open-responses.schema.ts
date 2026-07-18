/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/open-responses.schema.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ContentPart = unknown;

export type AssistantPhase = unknown;

export type ItemParam = unknown;

export type ToolDefinition = unknown;

export type CreateResponseBody = unknown;

export type ResponseStatus = unknown;

export type OutputItem = unknown;

export type Usage = unknown;

export type ResponseResource = unknown;

export type StreamingEvent = unknown;

export const InputTextContentPartSchema: any = undefined;

export const OutputTextContentPartSchema: any = undefined;

export const InputImageSourceSchema: any = undefined;

export const InputImageContentPartSchema: any = undefined;

export const InputFileSourceSchema: any = undefined;

export const InputFileContentPartSchema: any = undefined;

export const ContentPartSchema: any = undefined;

export const MessageItemRoleSchema: any = undefined;

export const AssistantPhaseSchema: any = undefined;

export const MessageItemSchema: any = undefined;

export const FunctionCallItemSchema: any = undefined;

export const FunctionCallOutputItemSchema: any = undefined;

export const ReasoningItemSchema: any = undefined;

export const ItemReferenceItemSchema: any = undefined;

export const ItemParamSchema: any = undefined;

export const FunctionToolDefinitionSchema: any = undefined;

export const ToolDefinitionSchema: any = undefined;

export const ToolChoiceSchema: any = undefined;

export const CreateResponseBodySchema: any = undefined;

export const ResponseStatusSchema: any = undefined;

export const OutputItemSchema: any = undefined;

export const UsageSchema: any = undefined;

export const ResponseResourceSchema: any = undefined;

export const ResponseCreatedEventSchema: any = undefined;

export const ResponseInProgressEventSchema: any = undefined;

export const ResponseCompletedEventSchema: any = undefined;

export const ResponseFailedEventSchema: any = undefined;

export const OutputItemAddedEventSchema: any = undefined;

export const OutputItemDoneEventSchema: any = undefined;

export const ContentPartAddedEventSchema: any = undefined;

export const ContentPartDoneEventSchema: any = undefined;

export const OutputTextDeltaEventSchema: any = undefined;

export const OutputTextDoneEventSchema: any = undefined;
