// TTS 指令编号：为指令分配自增序号，便于排序与追踪。
// 参考 openclaw/src/tts/directive-number.ts 的设计意图。

/** 已分配编号的指令结构。 */
export interface NumberedDirective {
  /** 指令文本或原始数据。 */
  text?: string;
  /** 已分配的指令编号。 */
  directiveNumber?: number;
}

let currentDirectiveNumber = 0;

/** 获取下一个待分配的指令编号（不消耗计数器）。 */
export function getNextDirectiveNumber(): number {
  return currentDirectiveNumber + 1;
}

/** 为指令分配下一个编号并写入 directiveNumber 字段，返回分配到的编号。 */
export function assignDirectiveNumber(directive: NumberedDirective): number {
  currentDirectiveNumber += 1;
  directive.directiveNumber = currentDirectiveNumber;
  return currentDirectiveNumber;
}

/** 重置指令编号计数器，通常在会话或批次开始时调用。 */
export function resetDirectiveNumbers(): void {
  currentDirectiveNumber = 0;
}
