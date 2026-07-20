/**
 * 移植自 openclaw/src/agents/tools/image-generate-tool.actions.ts
 *
 * 降级实现：提供图像生成工具动作，不再抛出 stub 错误。
 */

export function createImageGenerateListActionResult(_params: unknown): unknown {
  return { status: "unavailable", images: [] };
}

export function createImageGenerateStatusActionResult(_params: unknown): unknown {
  return { status: "unavailable" };
}

export function createImageGenerateDuplicateGuardResult(_params: unknown): unknown {
  return { status: "ok" };
}
