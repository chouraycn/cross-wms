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

export const InputTextContentPartSchema: unknown = undefined;

export const OutputTextContentPartSchema: unknown = undefined;

export const InputImageSourceSchema: unknown = undefined;

export const InputImageContentPartSchema: unknown = undefined;

export const InputFileSourceSchema: unknown = undefined;

export const InputFileContentPartSchema: unknown = undefined;

export const ContentPartSchema: unknown = undefined;

export const MessageItemRoleSchema: unknown = undefined;

export const AssistantPhaseSchema: unknown = undefined;

export const MessageItemSchema: unknown = undefined;

export const FunctionCallItemSchema: unknown = undefined;

export const FunctionCallOutputItemSchema: unknown = undefined;

export const ReasoningItemSchema: unknown = undefined;

export const ItemReferenceItemSchema: unknown = undefined;

export const ItemParamSchema: unknown = undefined;

export const FunctionToolDefinitionSchema: unknown = undefined;

export const ToolDefinitionSchema: unknown = undefined;

export const ToolChoiceSchema: unknown = undefined;

export const CreateResponseBodySchema: unknown = undefined;

export const ResponseStatusSchema: unknown = undefined;

export const OutputItemSchema: unknown = undefined;

export const UsageSchema: unknown = undefined;

export const ResponseResourceSchema: unknown = undefined;

export const ResponseCreatedEventSchema: unknown = undefined;

export const ResponseInProgressEventSchema: unknown = undefined;

export const ResponseCompletedEventSchema: unknown = undefined;

export const ResponseFailedEventSchema: unknown = undefined;

export const OutputItemAddedEventSchema: unknown = undefined;

export const OutputItemDoneEventSchema: unknown = undefined;

export const ContentPartAddedEventSchema: unknown = undefined;

export const ContentPartDoneEventSchema: unknown = undefined;

export const OutputTextDeltaEventSchema: unknown = undefined;

export const OutputTextDoneEventSchema: unknown = undefined;
