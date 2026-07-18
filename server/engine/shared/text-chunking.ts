// 按调用方提供的软中断选择将文本切分为有界块
// 解析器看到每个 limit 大小的窗口并返回窗口内的中断索引；
// 无效索引回退到硬限制，保证切片总能推进
export function avoidTrailingHighSurrogateBreak(text: string, start: number, end: number): number {
  if (end <= start || end >= text.length) {
    return end;
  }
  const previous = text.charCodeAt(end - 1);
  const next = text.charCodeAt(end);
  const splitsSurrogatePair =
    previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff;
  if (!splitsSurrogatePair) {
    return end;
  }
  const adjusted = end - 1;
  return adjusted > start ? adjusted : end + 1;
}

export function chunkTextByBreakResolver(
  text: string,
  limit: number,
  resolveBreakIndex: (window: string) => number,
): string[] {
  if (!text) {
    return [];
  }
  if (limit <= 0 || text.length <= limit) {
    return [text];
  }
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const candidateBreak = resolveBreakIndex(window);
    // 无效或零宽软中断会让循环卡住，所以回退到硬限制
    const breakIdx =
      Number.isFinite(candidateBreak) && candidateBreak > 0 && candidateBreak <= limit
        ? candidateBreak
        : limit;
    const safeBreakIdx = avoidTrailingHighSurrogateBreak(remaining, 0, breakIdx);
    const rawChunk = remaining.slice(0, safeBreakIdx);
    const chunk = rawChunk.trimEnd();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    // 把分隔符归属到边界：一个匹配到的分隔符在这里被消费，
    // 相邻的空白在下个窗口之前被 trim 掉
    const brokeOnSeparator = safeBreakIdx < remaining.length && /\s/.test(remaining[safeBreakIdx]);
    const nextStart = Math.min(remaining.length, safeBreakIdx + (brokeOnSeparator ? 1 : 0));
    remaining = remaining.slice(nextStart).trimStart();
  }
  if (remaining.length) {
    chunks.push(remaining);
  }
  return chunks;
}
