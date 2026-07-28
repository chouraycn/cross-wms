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

// ===================== 高级封装：带 overlap 的自然断点切分 =====================

const SENTENCE_BREAKS = new Set(['\n', '。', '.', '！', '!', '？', '?']);

export interface ChunkTextOptions {
  /** 单块最大字符数（默认 600） */
  maxChars?: number;
  /** 相邻块重叠字符数（默认 80），用于保留上下文连续性 */
  overlapChars?: number;
}

/**
 * 把长文本切分为有界块：优先在换行 / 句号等自然断点处截断，避免截断句子；
 * 块之间保留 overlapChars 字符重叠。块边界会自动规避 UTF-16 代理对截断。
 *
 * 这是主程序与数字员工知识库共用的权威切分实现（轻量、无重依赖），
 * 数字员工的 splitKnowledgeChunks 直接委托本函数，避免两处维护平行逻辑。
 */
export function chunkText(text: string, options: ChunkTextOptions = {}): string[] {
  const maxChars = Math.max(1, options.maxChars ?? 600);
  const overlapChars = Math.max(0, options.overlapChars ?? 80);
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];
  if (clean.length <= maxChars) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      let breakIdx = -1;
      // 在窗口末尾 120 字符内回看最近的自然断点
      for (let i = slice.length - 1; i >= Math.max(0, slice.length - 120); i--) {
        if (SENTENCE_BREAKS.has(slice[i])) {
          breakIdx = i + 1;
          break;
        }
      }
      if (breakIdx > 0) end = start + breakIdx;
    }
    // 代理对安全：避免把 UTF-16 代理对从中间切开
    end = avoidTrailingHighSurrogateBreak(clean, start, end);
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks.length ? chunks : [clean];
}
