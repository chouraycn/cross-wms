// 终端 device-status-report 辅助函数
// 拦截 PTY 输出中的光标位置请求，并在真实终端无法应答时生成紧凑响应

const ESC = String.fromCharCode(0x1b);
const DSR_PATTERN = new RegExp(`${ESC}\\[\\??6n`, "g");

/** 移除终端 device-status-report 光标请求并计数 */
export function stripDsrRequests(input: string): { cleaned: string; requests: number } {
  let requests = 0;
  const cleaned = input.replace(DSR_PATTERN, () => {
    requests += 1;
    return "";
  });
  return { cleaned, requests };
}

/** 为拦截的 DSR 请求构建终端光标位置响应 */
export function buildCursorPositionResponse(row = 1, col = 1): string {
  return `\x1b[${row};${col}R`;
}
