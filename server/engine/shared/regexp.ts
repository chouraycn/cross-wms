// 转义文本，使其能在 RegExp 模式中按字面量嵌入
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
