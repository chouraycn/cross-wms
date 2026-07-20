/**
 * 移植自 openclaw/src/agents/model-tool-support.ts
 *
 * 降级实现：提供模型工具支持检测，不再抛出 stub 错误。
 */

export function supportsModelTools(_provider: string, _model?: string): boolean {
  return true;
}
