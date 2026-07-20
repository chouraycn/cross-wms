/**
 * 移植自 openclaw/src/agents/tools/video-generate-tool.actions.ts
 *
 * 降级实现：提供视频生成工具动作，不再抛出 stub 错误。
 */

export function createVideoGenerateListActionResult(_params: unknown): unknown {
  return { status: "unavailable", videos: [] };
}

export function createVideoGenerateStatusActionResult(_params: unknown): unknown {
  return { status: "unavailable" };
}

export function createVideoGenerateDuplicateGuardResult(_params: unknown): unknown {
  return { status: "ok" };
}
