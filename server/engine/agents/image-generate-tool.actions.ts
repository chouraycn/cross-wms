/**
 * 移植自 openclaw/src/agents/tools/image-generate-tool.actions.ts
 *
 * 降级实现：提供图像生成工具动作，不再抛出 stub 错误。
 */

export function createImageGenerateListActionResult(_params: any): any {
  return { status: "unavailable", images: [] };
}

export function createImageGenerateStatusActionResult(_params: any): any {
  return { status: "unavailable" };
}

export function createImageGenerateDuplicateGuardResult(_params: any): any {
  return { status: "ok" };
}
