/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * 降级 stub — 移植自 openclaw/src/gateway/session-transcript-files.fs.ts
 *
 * 降级说明：openclaw 原始实现依赖大量未移植的内部模块（config/agents/plugins
 * /infra/channels/auto-reply/routing 等）与 @openclaw/* 外部包。
 * 此文件为降级占位：
 *  - 类型导出降级为 unknown / 空 interface
 *  - 函数体抛出 "not implemented"
 *  - 常量降级为 undefined
 * 完整实现见 openclaw 源码。
 */

export type ArchivedSessionTranscript = unknown;

export type SessionArchiveCleanupRule = unknown;

export function resolveSessionTranscriptCandidates(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveSessionTranscriptCandidates not implemented");
}

export async function resolveSessionTranscriptResetArchiveCandidatesAsync(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] resolveSessionTranscriptResetArchiveCandidatesAsync not implemented");
}

export function archiveFileOnDisk(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] archiveFileOnDisk not implemented");
}

export function archiveSessionTranscripts(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] archiveSessionTranscripts not implemented");
}

export function archiveSessionTranscriptsDetailed(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] archiveSessionTranscriptsDetailed not implemented");
}

export function resolveStableSessionEndTranscript(..._args: unknown[]): any {
  throw new Error("[cross-wms gateway downgrade] resolveStableSessionEndTranscript not implemented");
}

export async function cleanupArchivedSessionTranscripts(..._args: unknown[]): Promise<any> {
  throw new Error("[cross-wms gateway downgrade] cleanupArchivedSessionTranscripts not implemented");
}
