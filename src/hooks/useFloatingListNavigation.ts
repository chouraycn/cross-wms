/**
 * 浮动列表键盘导航
 *
 * 统一处理 Escape/ArrowUp/ArrowDown/Enter/Tab 键盘事件，
 * 用于斜杠命令选择器、技能选择器等浮动列表。
 *
 * 纯逻辑函数，不管理 state — 调用方负责维护 focusIndex 和 setFocusIndex。
 */
export interface FloatingListNavParams {
  /** 列表是否可见 */
  isOpen: boolean;
  /** 列表项数量 */
  itemCount: number;
  /** 当前焦点索引 */
  focusIndex: number;
  /** 设置焦点索引 */
  setFocusIndex: (updater: number | ((prev: number) => number)) => void;
  /** 选中项时回调，参数为当前焦点索引 */
  onSelect: (focusIndex: number) => void;
  /** 关闭列表时回调 */
  onClose: () => void;
  /** 是否允许 Tab 键选中（默认 false） */
  allowTabSelect?: boolean;
}

/**
 * 处理浮动列表键盘导航 — 返回 true 表示已消费该事件，false 表示未消费。
 */
export function handleFloatingListKeyDown(
  e: React.KeyboardEvent,
  isComposing: boolean,
  justEndedComposition: boolean,
  params: FloatingListNavParams,
): boolean {
  const { isOpen, itemCount, focusIndex, setFocusIndex, onSelect, onClose, allowTabSelect = false } = params;
  if (!isOpen || itemCount === 0) return false;

  if (e.key === 'Escape') {
    e.preventDefault();
    onClose();
    setFocusIndex(-1);
    return true;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    setFocusIndex(prev => (prev + 1) % itemCount);
    return true;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    setFocusIndex(prev => (prev <= 0 ? itemCount - 1 : prev - 1));
    return true;
  }

  const canSelect = allowTabSelect
    ? e.key === 'Tab' || (e.key === 'Enter' && !isComposing && !justEndedComposition)
    : e.key === 'Enter' && !isComposing && !justEndedComposition;

  if (canSelect) {
    e.preventDefault();
    onSelect(focusIndex);
    setFocusIndex(-1);
    return true;
  }

  return false;
}
