/**
 * 移植自 openclaw/src/agents/tools/pdf-native-providers.ts
 *
 * 降级实现：提供 PDF 分析函数签名，不再抛出 stub 错误。
 */

export async function anthropicAnalyzePdf(_params: unknown): Promise<unknown> {
  return null;
}

export async function geminiAnalyzePdf(_params: unknown): Promise<unknown> {
  return null;
}
