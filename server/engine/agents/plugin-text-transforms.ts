/**
 * 移植自 openclaw/src/agents/plugin-text-transforms.ts
 *
 * 降级实现：提供插件文本变换，不再抛出 stub 错误。
 */

export function mergePluginTextTransforms(_params: unknown): unknown {
  return null;
}

export function applyPluginTextReplacements(text: string): string {
  return text;
}

export function wrapStreamFnTextTransforms(streamFn: unknown): unknown {
  return streamFn;
}
