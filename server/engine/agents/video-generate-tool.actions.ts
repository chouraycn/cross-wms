/**
 * 移植自 openclaw/src/agents/tools/video-generate-tool.actions.ts
 *
 * 降级实现：提供视频生成工具动作，不再抛出 stub 错误。
 */

export function createVideoGenerateListActionResult(_params: any): any {
  return { status: "unavailable", videos: [] };
}

export function createVideoGenerateStatusActionResult(_params: any): any {
  return { status: "unavailable" };
}

export function createVideoGenerateDuplicateGuardResult(_params: any): any {
  return { status: "ok" };
}
