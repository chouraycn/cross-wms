/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
/**
 * Runtime barrel stub — 移植自 openclaw/src/gateway/session-archive.runtime.ts
 *
 * 降级说明：原始 barrel 从其他模块 re-export，部分模块在 cross-wms 未移植
 * 或导出名称不一致。此 stub 仅 re-export 已知存在的导出，其余降级为本地占位。
 */

// 原 re-export from ./session-archive.fs.js
export const archiveSessionTranscriptsDetailed: any = undefined;
// 原 re-export from ./session-archive.fs.js
export const archiveSessionTranscripts: any = undefined;
// 原 re-export from ./session-archive.fs.js
export const cleanupArchivedSessionTranscripts: any = undefined;
// 原 re-export from ./session-archive.fs.js
export const resolveStableSessionEndTranscript: any = undefined;