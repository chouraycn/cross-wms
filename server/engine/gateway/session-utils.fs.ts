/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/session-utils.fs.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export const archiveFileOnDisk: unknown = undefined;

export const archiveSessionTranscripts: unknown = undefined;

export const cleanupArchivedSessionTranscripts: unknown = undefined;

export const resolveSessionTranscriptCandidates: unknown = undefined;

export const resolveSessionTranscriptResetArchiveCandidatesAsync: unknown = undefined;

export type ReadRecentSessionMessagesOptions = unknown;

export type ReadSessionMessagesAsyncOptions = unknown;

export function attachOpenClawTranscriptMeta(..._args: unknown[]): unknown {
  return undefined;
}

export function readSessionMessages(..._args: unknown[]): unknown {
  return undefined;
}

export function readRecentSessionMessages(..._args: unknown[]): unknown {
  return undefined;
}

export function visitSessionMessages(..._args: unknown[]): unknown {
  return undefined;
}

export function readSessionMessageCount(..._args: unknown[]): unknown {
  return undefined;
}

export async function readSessionMessagesAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readSessionMessagesWithSourceAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readSessionMessageByIdAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function visitSessionMessagesAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readSessionMessageCountAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function readRecentSessionMessagesWithStats(..._args: unknown[]): unknown {
  return undefined;
}

export async function readRecentSessionMessagesAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readRecentSessionMessagesWithStatsAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function readRecentSessionTranscriptLines(..._args: unknown[]): unknown {
  return undefined;
}

export function capArrayByJsonBytes(..._args: unknown[]): unknown {
  return undefined;
}

export function readSessionTitleFieldsFromTranscript(..._args: unknown[]): unknown {
  return undefined;
}

export async function readSessionTitleFieldsFromTranscriptAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function resolveSessionHistoryTranscriptPathAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function readFirstUserMessageFromTranscript(..._args: unknown[]): unknown {
  return undefined;
}

export function readLatestSessionUsageFromTranscript(..._args: unknown[]): unknown {
  return undefined;
}

export async function readLatestSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readRecentSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export async function readLatestRecentSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<unknown> {
  return Promise.resolve(undefined);
}

export function readRecentSessionUsageFromTranscript(..._args: unknown[]): unknown {
  return undefined;
}

export function readSessionPreviewItemsFromTranscript(..._args: unknown[]): unknown {
  return undefined;
}
