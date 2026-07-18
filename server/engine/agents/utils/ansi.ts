/**
 * ANSI 转义码处理工具
 *
 * 提供 ANSI 转义序列的检测、剥离与长度计算，
 * 用于清理终端输出或渲染前的文本规范化。
 *
 * 参考自 openclaw/src/agents/utils/ansi.ts。
 */

function ansiRegex({ onlyFirst = false }: { onlyFirst?: boolean } = {}): RegExp {
  // 有效的字符串终止序列：BEL、ESC\ 以及 0x9c
  const ST = '(?:\\u0007|\\u001B\\u005C|\\u009C)';

  // 仅 OSC 序列：ESC ] ... ST（非贪婪直到第一个 ST）
  const osc = `(?:\\u001B\\][\\s\\S]*?${ST})`;

  // CSI 及相关序列：ESC/C1，可选中间字节，可选参数（支持 ; 与 :），最终字节
  const csi =
    '[\\u001B\\u009B][[\\]()#;?]*(?:\\d{1,4}(?:[;:]\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]';

  const pattern = `${osc}|${csi}`;

  return new RegExp(pattern, onlyFirst ? undefined : 'g');
}

const globalRegex = ansiRegex();
const firstOnlyRegex = ansiRegex({ onlyFirst: true });

/**
 * 剥离文本中的所有 ANSI 转义序列。
 * @param value 待清理的字符串
 */
export function stripAnsi(value: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`Expected a \`string\`, got \`${typeof value}\``);
  }

  // 快速路径：ANSI 码必须包含 ESC（7 位）或 CSI（8 位）引导字节
  if (!value.includes('\u001B') && !value.includes('\u009B')) {
    return value;
  }

  // .replace 会自动重置全局正则的 lastIndex，无需手动重置
  return value.replace(globalRegex, '');
}

/**
 * 判断文本是否包含 ANSI 转义序列。
 * @param value 待检测的字符串
 */
export function hasAnsi(value: string): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (!value.includes('\u001B') && !value.includes('\u009B')) {
    return false;
  }
  // 使用非全局正则避免 lastIndex 状态问题
  return firstOnlyRegex.test(value);
}

/**
 * 计算文本中 ANSI 转义序列的字符长度总和（不计可见字符）。
 * 用于在终端对齐时计算可见宽度差。
 * @param value 待计算的字符串
 */
export function ansiLength(value: string): number {
  if (typeof value !== 'string') {
    return 0;
  }
  if (!value.includes('\u001B') && !value.includes('\u009B')) {
    return 0;
  }
  // 总长度减去剥离后的可见长度即为 ANSI 序列长度
  return value.length - stripAnsi(value).length;
}
