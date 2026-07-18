/**
 * 进度草稿行移除辅助 — 移植自 openclaw/src/channels/progress-draft-lines.ts
 *
 * 降级策略：
 *  - 原 openclaw 依赖 ./streaming.js 中的 ChannelProgressDraftLine 完整类型定义。
 *  - cross-wms 的 streaming.ts 是独立实现，未导出该类型。
 *  - 本文件仅访问 line.id 字段，这里定义最小可用类型别名以满足类型契约。
 */

/**
 * 进度草稿行（降级占位）。
 *
 * openclaw 中 ChannelProgressDraftLine 包含 id/kind/text/label/icon/detail/status/toolName/prefix 等字段。
 * 本模块仅需通过 id 字段过滤行，故只保留该字段。其他字段在调用方上下文中以不透明对象处理。
 */
export type ChannelProgressDraftLine = {
  id?: string;
};

/** Progress draft state can mix legacy plain text lines with keyed structured lines. */
type ProgressDraftLine = string | ChannelProgressDraftLine;

/**
 * Removes a keyed structured progress line while preserving plain text draft lines.
 * Returns the original array when no line is removed so renderers can use identity as a no-op signal.
 */
export function removeChannelProgressDraftLine<TLine extends ProgressDraftLine>(
  lines: TLine[],
  id: string,
): TLine[] {
  const lineId = id.trim();
  if (!lineId) {
    return lines;
  }
  const next = lines.filter((line) => typeof line !== "object" || line.id?.trim() !== lineId);
  // Reference equality is part of the caller contract; redraw/delete work only runs after a real removal.
  return next.length === lines.length ? lines : next;
}
