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

export const archiveFileOnDisk: any = undefined;

export const archiveSessionTranscripts: any = undefined;

export const cleanupArchivedSessionTranscripts: any = undefined;

export const resolveSessionTranscriptCandidates: any = undefined;

export const resolveSessionTranscriptResetArchiveCandidatesAsync: any = undefined;

export type ReadRecentSessionMessagesOptions = unknown;

export type ReadSessionMessagesAsyncOptions = unknown;

export function attachOpenClawTranscriptMeta(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] attachOpenClawTranscriptMeta not implemented");
}

export function readSessionMessages(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readSessionMessages not implemented");
}

export function readRecentSessionMessages(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionMessages not implemented");
}

export function visitSessionMessages(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] visitSessionMessages not implemented");
}

export function readSessionMessageCount(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readSessionMessageCount not implemented");
}

export async function readSessionMessagesAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readSessionMessagesAsync not implemented");
}

export async function readSessionMessagesWithSourceAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readSessionMessagesWithSourceAsync not implemented");
}

export async function readSessionMessageByIdAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readSessionMessageByIdAsync not implemented");
}

export async function visitSessionMessagesAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] visitSessionMessagesAsync not implemented");
}

export async function readSessionMessageCountAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readSessionMessageCountAsync not implemented");
}

export function readRecentSessionMessagesWithStats(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionMessagesWithStats not implemented");
}

export async function readRecentSessionMessagesAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionMessagesAsync not implemented");
}

export async function readRecentSessionMessagesWithStatsAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionMessagesWithStatsAsync not implemented");
}

export function readRecentSessionTranscriptLines(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionTranscriptLines not implemented");
}

export function capArrayByJsonBytes(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] capArrayByJsonBytes not implemented");
}

export function readSessionTitleFieldsFromTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readSessionTitleFieldsFromTranscript not implemented");
}

export async function readSessionTitleFieldsFromTranscriptAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readSessionTitleFieldsFromTranscriptAsync not implemented");
}

export async function resolveSessionHistoryTranscriptPathAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] resolveSessionHistoryTranscriptPathAsync not implemented");
}

export function readFirstUserMessageFromTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readFirstUserMessageFromTranscript not implemented");
}

export function readLatestSessionUsageFromTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readLatestSessionUsageFromTranscript not implemented");
}

export async function readLatestSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readLatestSessionUsageFromTranscriptAsync not implemented");
}

export async function readRecentSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionUsageFromTranscriptAsync not implemented");
}

export async function readLatestRecentSessionUsageFromTranscriptAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] readLatestRecentSessionUsageFromTranscriptAsync not implemented");
}

export function readRecentSessionUsageFromTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readRecentSessionUsageFromTranscript not implemented");
}

export function readSessionPreviewItemsFromTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] readSessionPreviewItemsFromTranscript not implemented");
}
