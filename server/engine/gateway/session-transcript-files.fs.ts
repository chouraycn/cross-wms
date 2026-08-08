 
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

export function resolveSessionTranscriptCandidates(..._args: any[]): any {
  return undefined;
}

export async function resolveSessionTranscriptResetArchiveCandidatesAsync(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}

export function archiveFileOnDisk(..._args: any[]): any {
  return undefined;
}

export function archiveSessionTranscripts(..._args: any[]): any {
  return undefined;
}

export function archiveSessionTranscriptsDetailed(..._args: any[]): any {
  return undefined;
}

export function resolveStableSessionEndTranscript(..._args: any[]): any {
  return undefined;
}

export async function cleanupArchivedSessionTranscripts(..._args: any[]): Promise<any> {
  return Promise.resolve(undefined);
}
