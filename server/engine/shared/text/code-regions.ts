// 代码区域辅助：在 Markdown 文本中查找围栏与行内代码段
export interface CodeRegion {
  start: number;
  end: number;
}

/** 查找围栏与行内 Markdown 代码区域，便于文本清理器跳过示例 */
export function findCodeRegions(text: string): CodeRegion[] {
  const regions: CodeRegion[] = [];

  const fencedRe = /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(?:\n\2|$)/g;
  for (const match of text.matchAll(fencedRe)) {
    const start = (match.index ?? 0) + match[1].length;
    regions.push({ start, end: start + match[0].length - match[1].length });
  }

  const inlineRe = /`+[^`]+`+/g;
  for (const match of text.matchAll(inlineRe)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    const insideFenced = regions.some((r) => start >= r.start && end <= r.end);
    if (!insideFenced) {
      regions.push({ start, end });
    }
  }

  regions.sort((a, b) => a.start - b.start);
  return regions;
}

/** 当字符偏移落在任一已发现代码区域内时返回 true */
export function isInsideCode(pos: number, regions: CodeRegion[]): boolean {
  return regions.some((r) => pos >= r.start && pos < r.end);
}
